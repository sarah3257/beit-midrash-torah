import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
const {default:sanitizeHtml}=await import(process.env.VERCEL?'./cloud/vendor/sanitize.cjs':'sanitize-html');
import archiver from 'archiver';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { Parser } from 'htmlparser2';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import {mergeLibrary} from './sync.mjs';
import {mountLocalCloud} from './local-cloud.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
export function clean(html='') { return sanitizeHtml(String(html),{allowedTags:['p','br','strong','b','em','i','u','s','h1','h2','h3','blockquote','ul','ol','li','span','div','a','table','thead','tbody','tr','th','td'],allowedAttributes:{'*':['dir'],a:['href','title'],p:['style'],div:['style'],span:['style'],td:['colspan','rowspan'],th:['colspan','rowspan']},allowedStyles:{'*':{'text-align':[/^(right|left|center|justify)$/],'font-size':[/^\d+(px|pt)$/]}},allowedSchemes:['https','http','mailto'],transformTags:{a:sanitizeHtml.simpleTransform('a',{rel:'noopener noreferrer',target:'_blank'})}}); }
export function plain(html='') { let result='';const parser=new Parser({ontext:t=>result+=t,onclosetag:t=>{if(['p','div','h1','h2','h3','li','blockquote','tr'].includes(t))result+='\n';},onopentag:t=>{if(t==='br')result+='\n';}},{decodeEntities:true});parser.write(html);parser.end();return result.trim(); }
const fail=(status,message)=>Object.assign(new Error(message),{status});
function topicName(value){const name=String(value??'').trim().replace(/\s+/g,' ');if(!name||name.length>120)throw fail(400,'יש להזין שם נושא באורך של עד 120 תווים');return name;}
export async function createApp(dataDir=path.join(root,'data'),options={}) {
 const repository=options.repository,cloud=!!repository;
 if(!cloud){await fs.mkdir(path.join(dataDir,'backups'),{recursive:true});
 await fs.mkdir(path.join(dataDir,'uploads'),{recursive:true});}
 const catalog=JSON.parse(await fs.readFile(path.join(root,'public/catalog.json'),'utf8'));
 const storePath=path.join(dataDir,'library.json');
 let store;if(cloud)store=await repository.read();else try{store=JSON.parse(await fs.readFile(storePath,'utf8'));if(store.format!==1||!Array.isArray(store.documents))throw Error('Invalid library');}catch(e){if(e.code!=='ENOENT')throw Error('לא ניתן לקרוא את ספריית הכתבים. הקובץ המקורי לא שונה. '+e.message);store={format:1,documents:[]};}
 store.topics=[...new Set([...(store.topics||[]),...store.documents.filter(d=>d.kind==='topic').map(d=>d.topic)].map(topicName))];
 let queue=Promise.resolve();
 async function change(fn) {
  if(cloud){const result=await repository.change(fn);store=await repository.read();return result;}
  const job=queue.then(async()=>{const next=structuredClone(store);const result=await fn(next);next.topics=[...new Set([...next.topics,...next.documents.filter(d=>d.kind==='topic').map(d=>d.topic)])];const old=JSON.stringify(store);const day=new Date().toISOString().slice(0,10);await fs.writeFile(path.join(dataDir,'backups',day+'.json'),old,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});const tmp=storePath+'.tmp';await fs.writeFile(tmp,JSON.stringify(next,null,2),'utf8');await fs.rename(tmp,storePath);store=next;return result;});queue=job.catch(()=>{});return job;
 }
 function location(v) {
  if(v.kind==='topic')return {kind:'topic',topic:topicName(v.topic),tractate:null,chapter:null,daf:null,amud:null};
  if(v.kind&&v.kind!=='bavli')throw fail(400,'סוג מיקום לא תקין');
  const t=catalog.tractates.find(t=>t.id===v.tractate);const daf=Number(v.daf),amud=v.amud;
  const n=daf*2+(amud==='b'?1:0);const toN=p=>p.daf*2+(p.amud==='b'?1:0);
  if(!t||!Number.isInteger(daf)||!['a','b'].includes(amud)||n<toN(t.start)||n>toN(t.end))throw fail(400,'מיקום לא תקין בגמרא');
  const chapters=t.chapters.filter(c=>n>=toN(c.start)&&n<=toN(c.end));
  const chapter=Number(v.chapter)||chapters[0]?.id;
  if(!chapters.some(c=>c.id===chapter))throw fail(400,'הפרק אינו מתאים לדף ולעמוד שבחרת');
  return {kind:'bavli',topic:null,tractate:t.id,chapter,daf,amud};
 }
 function content(v) {const html=clean(v.html||'');if(html.length>2_000_000)throw fail(400,'המסמך גדול מדי');return {title:String(v.title||'חידוש ללא כותרת').trim().slice(0,300)||'חידוש ללא כותרת',html,text:plain(html),tags:Array.isArray(v.tags)?v.tags.map(t=>String(t).trim().slice(0,50)).filter(Boolean).slice(0,20):[],favorite:!!v.favorite,...location(v)};}
 async function readOriginal(id){return cloud?repository.readOriginal(id):fs.readFile(path.join(dataDir,'uploads',id+'.docx'));}
 async function writeOriginal(id,buffer){return cloud?repository.writeOriginal(id,buffer):fs.writeFile(path.join(dataDir,'uploads',id+'.docx'),buffer);}
 function syncDocument(raw){
  if(!/^[a-f0-9-]{36}$/.test(raw.id))throw fail(400,'מזהה מסמך לא תקין');
  return {id:raw.id,...content(raw),createdAt:validDate(raw.createdAt),updatedAt:validDate(raw.updatedAt),version:Number.isInteger(raw.version)&&raw.version>0?raw.version:1,deletedAt:raw.deletedAt?validDate(raw.deletedAt):null,...(raw.sourceName?{sourceName:String(raw.sourceName).slice(0,300)}:{}),revisions:(Array.isArray(raw.revisions)?raw.revisions:[]).slice(-50).map(v=>({...content(v),id:raw.id,createdAt:validDate(v.createdAt),updatedAt:validDate(v.updatedAt),version:Number(v.version)||1,deletedAt:v.deletedAt?validDate(v.deletedAt):null}))};
 }
 const summary=d=>{const {revisions,html,...rest}=d;return {...rest,revisionCount:revisions.length};};
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','same-origin');res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'");const host=req.headers.host?.split(':')[0];if(!cloud&&!['localhost','127.0.0.1','['].includes(host))return res.status(403).json({error:'גישה מקומית בלבד'});if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin&&req.headers.origin!==(cloud?options.origin:`http://${req.headers.host}`))return res.status(403).json({error:'מקור בקשה לא מורשה'});next();});
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use(express.json({limit:'30mb'}));
 const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 app.get('/api/runtime',(_req,res)=>res.json({local:!cloud}));
 if(!cloud)await mountLocalCloud(app,{dataDir,read:()=>store,change,asyncRoute,secretCodec:options.secretCodec});
 if(cloud){
  app.post('/api/sync',asyncRoute(async(req,res)=>{
   const entries=req.body.documents,topics=req.body.topics||[];
   if(!Array.isArray(entries)||entries.length>20||!Array.isArray(topics)||topics.length>10000)throw fail(400,'בקשת סנכרון לא תקינה');
   const result=await change(s=>mergeLibrary(s,entries,topics.map(topicName),syncDocument));res.json(result);
  }));
  app.get('/api/sync-original/:id',asyncRoute(async(req,res)=>{
   if(!store.documents.some(d=>d.id===req.params.id&&d.sourceName))throw fail(404,'מסמך לא נמצא');
   const buffer=await readOriginal(req.params.id).catch(()=>null);
   if(req.query.offset!==undefined){const offset=Number(req.query.offset);if(!Number.isSafeInteger(offset)||offset<0)throw fail(400,'מיקום לא תקין');return res.json({data:buffer?.subarray(offset,offset+1500000).toString('base64')||'',total:buffer?.length||0});}
   res.json({exists:!!buffer});
  }));
  app.post('/api/sync-original/:id',asyncRoute(async(req,res)=>{
   if(!store.documents.some(d=>d.id===req.params.id&&d.sourceName))throw fail(404,'מסמך לא נמצא');
   const {offset,total,data}=req.body;
   if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(total)||total<=0||total>15*1024*1024||typeof data!=='string'||data.length>2100000)throw fail(400,'קובץ לא תקין');
   await repository.writeChunk(req.params.id,offset,total,Buffer.from(data,'base64'));res.json({ok:true});
  }));
 }
 app.get('/api/topics',(_req,res)=>res.json(store.topics));
 app.post('/api/topics',asyncRoute(async(req,res)=>{const name=topicName(req.body.name);await change(s=>{if(!s.topics.includes(name))s.topics.push(name);});res.json({name});}));
 app.get('/api/documents',(_req,res)=>res.json(store.documents.map(summary)));
 app.get('/api/status',(_req,res)=>res.json({local:!cloud,documents:store.documents.filter(d=>!d.deletedAt).length,...(cloud?{user:options.user}:{dataDir})}));
 app.get('/api/documents/:id',(req,res)=>{const d=store.documents.find(d=>d.id===req.params.id);if(!d)return res.status(404).json({error:'המסמך לא נמצא'});const {revisions,...doc}=d;res.json({...doc,revisionCount:revisions.length});});
 app.post('/api/documents',asyncRoute(async(req,res)=>{const fields=content(req.body);const now=new Date().toISOString();const doc={id:randomUUID(),...fields,createdAt:now,updatedAt:now,version:1,deletedAt:null,revisions:[]};await change(s=>{s.documents.push(doc);});res.status(201).json({...doc,revisions:undefined,revisionCount:0});}));
 app.put('/api/documents/:id',asyncRoute(async(req,res)=>{const result=await change(s=>{const d=s.documents.find(d=>d.id===req.params.id);if(!d)throw fail(404,'המסמך לא נמצא');if(d.deletedAt)throw fail(409,'המסמך נמצא בסל המחזור');if(req.body.version!==d.version)throw fail(409,'המסמך השתנה בחלון אחר. העתק את הטקסט שלך לפני טעינה מחדש.');const fields=content(req.body);const {revisions,...before}=d;d.revisions.push(before);d.revisions=d.revisions.slice(-50);Object.assign(d,fields,{updatedAt:new Date().toISOString(),version:d.version+1});return {...d,revisions:undefined,revisionCount:d.revisions.length};});res.json(result);}));
 app.post('/api/documents/:id/trash',asyncRoute(async(req,res)=>{await change(s=>{const d=s.documents.find(d=>d.id===req.params.id);if(!d)throw fail(404,'המסמך לא נמצא');d.deletedAt=new Date().toISOString();d.version++;});res.json({ok:true});}));
 app.post('/api/documents/:id/restore',asyncRoute(async(req,res)=>{await change(s=>{const d=s.documents.find(d=>d.id===req.params.id);if(!d)throw fail(404,'המסמך לא נמצא');d.deletedAt=null;d.updatedAt=new Date().toISOString();d.version++;});res.json({ok:true});}));
 app.get('/api/documents/:id/revisions',(req,res)=>{const d=store.documents.find(d=>d.id===req.params.id);if(!d)return res.status(404).json({error:'המסמך לא נמצא'});res.json(d.revisions.slice().reverse());});
 app.get('/api/documents/:id/export',asyncRoute(async(req,res)=>{const d=store.documents.find(d=>d.id===req.params.id);if(!d)throw fail(404,'המסמך לא נמצא');const t=catalog.tractates.find(t=>t.id===d.tractate);const lines=plain(d.html).split('\n');const document=new Document({sections:[{children:[new Paragraph({heading:'Heading1',bidirectional:true,alignment:AlignmentType.RIGHT,children:[new TextRun({text:d.title,rightToLeft:true})]}),new Paragraph({bidirectional:true,children:[new TextRun({text:d.kind==='topic'?`נושא: ${d.topic}`:`${t.name} | ${d.daf}${d.amud==='a'?'א':'ב'}`,rightToLeft:true})]}),...lines.map(text=>new Paragraph({bidirectional:true,alignment:AlignmentType.RIGHT,children:[new TextRun({text,rightToLeft:true,font:'David',size:26})]}))]}]});res.attachment('chiddush.docx');res.send(await Packer.toBuffer(document));}));
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024,files:1}});
 app.post('/api/import-word',upload.single('file'),asyncRoute(async(req,res)=>{if(!req.file||!req.file.originalname.toLowerCase().endsWith('.docx'))throw fail(400,'ניתן לייבא קובצי ‎.docx. קובץ ‎.doc יש לשמור תחילה כ־‎.docx ב־Word או ב־LibreOffice.');const loc=location(req.body);const rawName=Buffer.from(req.file.originalname,'latin1');const sourceName=isUtf8(rawName)?rawName.toString('utf8'):req.file.originalname;let converted;try{converted=await mammoth.convertToHtml({buffer:req.file.buffer});}catch{throw fail(400,'קובץ Word לא תקין או מוגן בסיסמה');}const now=new Date().toISOString();const doc={id:randomUUID(),...content({...loc,title:sourceName.replace(/\.docx$/i,''),html:converted.value}),sourceName:sourceName.slice(0,300),createdAt:now,updatedAt:now,version:1,deletedAt:null,revisions:[]};await writeOriginal(doc.id,req.file.buffer);await change(s=>s.documents.push(doc));res.status(201).json({...doc,revisions:undefined,revisionCount:0,warnings:converted.messages.map(x=>x.message)});}));
 app.get('/api/documents/:id/original',asyncRoute(async(req,res)=>{const d=store.documents.find(d=>d.id===req.params.id);if(!d?.sourceName)throw fail(404,'אין קובץ מקור למסמך זה');res.attachment('original.docx');res.send(await readOriginal(d.id));}));
 app.get('/api/backup.json',(_req,res)=>{res.attachment('torah-library-'+new Date().toISOString().slice(0,10)+'.json');res.json({...store,exportedAt:new Date().toISOString()});});
 app.get('/api/backup.zip',asyncRoute(async(_req,res)=>{res.attachment('torah-library.zip');const archive=archiver('zip',{zlib:{level:9}});archive.on('error',e=>res.destroy(e));archive.pipe(res);archive.append(JSON.stringify(store,null,2),{name:'library.json'});if(!cloud)archive.directory(path.join(dataDir,'uploads'),'original-word-files');else for(const d of store.documents.filter(d=>d.sourceName)){const original=await readOriginal(d.id).catch(()=>null);if(original)archive.append(original,{name:'original-word-files/'+d.id+'.docx'});}for(const d of store.documents){const t=catalog.tractates.find(t=>t.id===d.tractate);const safe=x=>x.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100);archive.append(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>${sanitizeHtml(d.title,{allowedTags:[],allowedAttributes:{}})}</title><body><h1>${sanitizeHtml(d.title,{allowedTags:[],allowedAttributes:{}})}</h1>${d.html}</body></html>`,{name:`${d.deletedAt?'סל מחזור/':''}${d.kind==='topic'?`נושאים נוספים/${safe(d.topic)}`:`${safe(t.name)}/פרק ${d.chapter}/דף ${d.daf} עמוד ${d.amud==='a'?'א':'ב'}`}/${safe(d.title)}-${d.id.slice(0,8)}.html`});}await archive.finalize();}));
 app.post('/api/restore-backup',asyncRoute(async(req,res)=>{if(req.body.format!==1||!Array.isArray(req.body.documents)||req.body.documents.length>10000)throw fail(400,'קובץ גיבוי לא תקין');const incoming=req.body.documents.map(raw=>{if(!/^[a-f0-9-]{36}$/.test(raw.id))throw fail(400,'מזהה מסמך לא תקין');return {id:raw.id,...content(raw),createdAt:validDate(raw.createdAt),updatedAt:validDate(raw.updatedAt),version:1,deletedAt:raw.deletedAt?validDate(raw.deletedAt):null,revisions:[]};});const restoredTopics=(req.body.topics||[]).map(topicName);let count=0;await change(s=>{s.topics=[...new Set([...s.topics,...restoredTopics])];const ids=new Set(s.documents.map(d=>d.id));for(const d of incoming)if(!ids.has(d.id)){s.documents.push(d);ids.add(d.id);count++;}});res.json({added:count,skipped:incoming.length-count});}));
 app.use(express.static(path.join(root,'public'),{etag:true}));
 app.use((err,_req,res,_next)=>{console.error(err.message);res.status(err.status|| (err.code==='LIMIT_FILE_SIZE'?413:500)).json({error:err.status?err.message:err.code==='LIMIT_FILE_SIZE'?'הקובץ גדול מ־15MB':'הפעולה לא הושלמה. הכתבים הקיימים נשמרו; נסה שוב.'});});
 return app;
}
function validDate(v){const date=new Date(v);return Number.isNaN(date.getTime())?new Date().toISOString():date.toISOString();}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createApp();const port=Number(process.env.PORT)||4318;
 const server=app.listen(port,'127.0.0.1',()=>console.log(`בית המדרש שלי — http://localhost:${port}`));
 server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'האתר כבר פועל או שהפורט תפוס. פתח http://localhost:'+port:e);process.exitCode=1;});
}
