import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {documentHash,applyCloudSnapshot} from './sync.mjs';

const config=JSON.parse(await fs.readFile(new URL('./cloud-config.json',import.meta.url),'utf8'));
const fail=(status,message)=>Object.assign(Error(message),{status});

export async function mountLocalCloud(app,{dataDir,read,change,asyncRoute,secretCodec}){
 const sessionPath=path.join(dataDir,'.cloud-session.json');
 const syncPath=path.join(dataDir,'.cloud-sync.json');
 let session=null,busy=false;
 try{const saved=JSON.parse(await fs.readFile(sessionPath,'utf8'));session={...saved,token:saved.encrypted?secretCodec?.decode(saved.token):saved.token};if(!session.token)session=null;}catch{}
 async function request(endpoint,options={}){
  try{
   const response=await fetch(config.url+endpoint,{...options,redirect:'error',signal:AbortSignal.timeout(90000),headers:{'Content-Type':'application/json',Origin:config.url,...(session?{Authorization:'Bearer '+session.token}:{}),...options.headers}});
   if(!response.ok){const body=await response.json().catch(()=>({}));throw fail(response.status,response.status===401?'יש להתחבר מחדש לחשבון בענן':body.error||body.message||'הענן לא השלים את הבקשה');}
   return response;
  }catch(e){if(e.status)throw e;throw fail(503,'אין חיבור לענן כרגע. כל הכתבים נשארו במחשב; אפשר להמשיך לכתוב ולנסות שוב כשיש אינטרנט.');}
 }
 app.get('/api/cloud/status',(_req,res)=>res.json({local:true,url:config.url,user:session?.user||null,lastSync:session?.lastSync||null}));
 app.post('/api/cloud/login',asyncRoute(async(req,res)=>{
  if(busy)throw fail(409,'הסנכרון עדיין פועל');
  const signup=req.body.signup===true;
  const response=await request('/api/auth/'+(signup?'sign-up/email':'sign-in/email'),{method:'POST',body:JSON.stringify({email:req.body.email,password:req.body.password,...(signup?{name:req.body.name||req.body.email.split('@')[0]}:{})})});
  const body=await response.json(),token=response.headers.get('set-auth-token');
  if(!token||!body.user)throw fail(502,'ההתחברות לא הושלמה');
  session={token,user:{id:body.user.id,email:body.user.email,name:body.user.name}};
  const encrypted=!!secretCodec;await fs.writeFile(sessionPath,JSON.stringify({...session,token:encrypted?secretCodec.encode(token):token,encrypted}),{mode:0o600});
  res.json({user:session.user});
 }));
 app.post('/api/cloud/logout',asyncRoute(async(_req,res)=>{
  if(busy)throw fail(409,'המתן לסיום הסנכרון');
  if(session)await request('/api/auth/sign-out',{method:'POST',body:'{}'}).catch(()=>{});
  session=null;await fs.rm(sessionPath,{force:true});res.json({ok:true});
 }));
 app.post('/api/cloud/sync',asyncRoute(async(_req,res)=>{
  if(!session)throw fail(401,'יש להתחבר לחשבון בענן');
  if(busy)throw fail(409,'סנכרון כבר מתבצע');
  busy=true;
  try{
   const snapshot=structuredClone(read());
   let bases={};try{const saved=JSON.parse(await fs.readFile(syncPath,'utf8'));if(saved.account===session.user.id)bases=saved.hashes;}catch{}
   // Documents travel separately, so large libraries do not exceed serverless request limits.
   const mappings=[];let conflicts=0,uploaded=0;
   for(const doc of snapshot.documents){
    const transferDoc=structuredClone(doc);while(Buffer.byteLength(JSON.stringify(transferDoc))>3500000&&transferDoc.revisions.length)transferDoc.revisions.shift();
    const result=await (await request('/api/sync',{method:'POST',body:JSON.stringify({documents:[{doc:transferDoc,baseHash:bases[doc.id]||null}],topics:[]})})).json();
    mappings.push(...result.mappings);conflicts+=result.conflicts;uploaded+=result.uploaded;
   }
   await request('/api/sync',{method:'POST',body:JSON.stringify({documents:[],topics:snapshot.topics})});
   // Original Word files are included as well as the editable text.
   for(const doc of snapshot.documents.filter(d=>d.sourceName)){
    const mapped=mappings.find(m=>m.from===doc.id),id=mapped?.to||doc.id;
    const info=await (await request('/api/sync-original/'+id)).json();
    if(!info.exists){
     let buffer;try{buffer=await fs.readFile(path.join(dataDir,'uploads',doc.id+'.docx'));}catch{continue;}
     for(let offset=0;offset<buffer.length;offset+=1500000){
      await request('/api/sync-original/'+id,{method:'POST',body:JSON.stringify({offset,total:buffer.length,data:buffer.subarray(offset,offset+1500000).toString('base64')})});
     }
    }
   }
   const summaries=await (await request('/api/documents')).json();
   const remote={format:1,documents:[],topics:await (await request('/api/topics')).json()};
   for(const summary of summaries){
    const doc=await (await request('/api/documents/'+summary.id)).json();
    doc.revisions=await (await request('/api/documents/'+summary.id+'/revisions')).json();doc.revisions.reverse();
    remote.documents.push(doc);
    if(doc.sourceName){
     try{await fs.access(path.join(dataDir,'uploads',doc.id+'.docx'));}catch{
      const chunks=[];let offset=0,total;do{const piece=await (await request('/api/sync-original/'+doc.id+'?offset='+offset)).json();total=piece.total;if(!total)break;const buffer=Buffer.from(piece.data,'base64');if(!buffer.length)throw fail(502,'קובץ המקור לא התקבל בשלמותו');chunks.push(buffer);offset+=buffer.length;}while(offset<total);if(total)await fs.writeFile(path.join(dataDir,'uploads',doc.id+'.docx'),Buffer.concat(chunks));
     }
    }
   }
   await change(store=>applyCloudSnapshot(store,snapshot,remote));
   const saved={account:session.user.id,hashes:Object.fromEntries(remote.documents.map(d=>[d.id,documentHash(d)]))};
   await fs.writeFile(syncPath+'.tmp',JSON.stringify(saved),{mode:0o600});await fs.rename(syncPath+'.tmp',syncPath);
   session.lastSync=new Date().toISOString();
   await fs.writeFile(sessionPath,JSON.stringify({...session,token:secretCodec?secretCodec.encode(session.token):session.token,encrypted:!!secretCodec}),{mode:0o600});
   res.json({uploaded,conflicts,documents:remote.documents.length,lastSync:session.lastSync});
  }finally{busy=false;}
 }));
}
