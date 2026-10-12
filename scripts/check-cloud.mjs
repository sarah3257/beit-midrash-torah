import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {Document,Packer,Paragraph} from 'docx';
import {createApp} from '../server.mjs';
import {sql} from '../cloud/db.mjs';

const origin='https://beit-midrash-torah.vercel.app';
const users=[],servers=[],dirs=[];
const original=await fs.readFile('data/library.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function request(base,endpoint,{body,method,token}={}){
 const response=await fetch(base+endpoint,{method:method||(body?'POST':'GET'),headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
 if(!response.ok)throw Error(endpoint+' returned '+response.status+': '+await response.text());
 return response;
}
async function account(){
 const email='torah-check-'+randomUUID()+'@example.com',password=randomBytes(24).toString('base64url');
 const response=await request(origin,'/api/auth/sign-up/email',{body:{email,password,name:'בדיקת מערכת זמנית'}});
 const result=await response.json();users.push(result.user.id);
 const token=response.headers.get('set-auth-token');assert.ok(token);
 return {email,password,token,id:result.user.id};
}
async function device(account){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'torah-cloud-check-'));dirs.push(dir);
 const app=await createApp(dir);const server=app.listen(0,'127.0.0.1');servers.push(server);await new Promise(resolve=>server.on('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 // Local CSRF protection expects its own origin, so use a dedicated request helper.
 const call=async(endpoint,body,method)=>{
  const r=await fetch(base+'/api'+endpoint,{method:method||(body?'POST':'GET'),headers:{Origin:base,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  const result=await r.json();assert.ok(r.ok,endpoint+': '+JSON.stringify(result));return result;
 };
 await call('/cloud/login',{email:account.email,password:account.password});
 return {dir,base,call};
}
try{
 const runtime=await request(origin,'/api/runtime').then(r=>r.json());assert.equal(runtime.ready,true);
 const owner=await account(),other=await account();
 const first=await device(owner);
 const local=await first.call('/documents',{kind:'topic',topic:'בדיקת סנכרון',title:'כתיבה במחשב',html:'<p>נכתב ללא תלות בענן</p>',tags:['בדיקה']});
 const buffer=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('קובץ Word לבדיקה')]}]}));
 const form=new FormData();form.append('kind','topic');form.append('topic','בדיקת סנכרון');form.append('file',new Blob([buffer]),'test.docx');
 const imported=await first.call('/import-word',form);
 const synced=await first.call('/cloud/sync',{});assert.equal(synced.uploaded,2);assert.equal(synced.conflicts,0);
 const remote=await request(origin,'/api/documents/'+local.id,{token:owner.token}).then(r=>r.json());assert.equal(remote.title,'כתיבה במחשב');
 const originalWord=await request(origin,'/api/documents/'+imported.id+'/original',{token:owner.token}).then(r=>r.arrayBuffer());assert.equal(hash(Buffer.from(originalWord)),hash(buffer));
 await request(origin,'/api/documents/'+local.id,{method:'PUT',token:owner.token,body:{...remote,title:'שינוי בענן',html:'<p>נוסח מהאתר</p>'}});
 const current=await first.call('/documents/'+local.id);
 await first.call('/documents/'+local.id,{...current,title:'שינוי מקומי במקביל',html:'<p>נוסח מהמחשב</p>'},'PUT');
 const conflict=await first.call('/cloud/sync',{});assert.equal(conflict.conflicts,1);
 const all=await first.call('/documents');assert.equal(all.length,3);assert.ok(all.some(d=>d.title==='שינוי בענן'));assert.ok(all.some(d=>d.title.includes('שינוי מקומי במקביל')));
 const second=await device(owner);await second.call('/cloud/sync',{});const secondDocs=await second.call('/documents');assert.equal(secondDocs.length,3);
 assert.equal(hash(await fs.readFile(path.join(second.dir,'uploads',imported.id+'.docx'))),hash(buffer));
 const isolated=await request(origin,'/api/documents',{token:other.token}).then(r=>r.json());assert.equal(isolated.length,0);
 assert.equal((await fetch(origin+'/api/documents/'+local.id,{headers:{Authorization:'Bearer '+other.token}})).status,404);
 assert.equal((await fetch(origin+'/api/documents')).status,401);
 await first.call('/documents/'+local.id+'/trash',{});await first.call('/cloud/sync',{});
 const trashed=await request(origin,'/api/documents/'+local.id,{token:owner.token}).then(r=>r.json());assert.ok(trashed.deletedAt);
 await first.call('/cloud/logout',{});assert.equal((await first.call('/cloud/status')).user,null);
 assert.equal(hash(original),hash(await fs.readFile('data/library.json')));
 console.log('PASS: production sign-up, signed-token login, local upload, cloud persistence, Word original, concurrent-edit conflict, second-device download, account isolation, trash and logout. Personal library unchanged.');
}finally{
 await Promise.all(servers.map(server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})));
 for(const id of users)await sql`DELETE FROM "user" WHERE id=${id}`;
 await sql.end();
 for(const dir of dirs){assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'torah-cloud-check-'));await fs.rm(dir,{recursive:true,force:true});}
}
