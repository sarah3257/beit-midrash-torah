import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp, clean } from '../server.mjs';
import { Document, Packer, Paragraph, TextRun } from 'docx';

test('catalog has 37 tractates, valid chapters and shared boundaries',async()=>{
 const c=JSON.parse(await fs.readFile(new URL('../public/catalog.json',import.meta.url),'utf8'));
 assert.equal(c.tractates.length,37);assert.equal(new Set(c.tractates.map(t=>t.id)).size,37);
 const pos=p=>p.daf*2+(p.amud==='b'?1:0);
 for(const t of c.tractates){assert.ok(t.chapters.length);for(const ch of t.chapters){assert.ok(ch.name);assert.ok(pos(ch.start)<=pos(ch.end));assert.ok(pos(ch.start)>=pos(t.start)&&pos(ch.end)<=pos(t.end));}}
 const t=c.tractates.find(t=>t.id==='sanhedrin');assert.equal(t.chapters.find(c=>c.start.daf<=80&&c.end.daf>=80).name,'הנשרפין');assert.equal(t.chapters.filter(c=>pos(c.start)<=180&&pos(c.end)>=180).length,2);
});
test('full lifecycle: save, conflicts, Word, history, trash, backup, disk recovery',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'torah-test-'));const app=await createApp(dir);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const req=async(url,method='GET',body)=>{const res=await fetch(base+'/api'+url,{method,headers:body instanceof FormData?{}:{'Content-Type':'application/json'},body:body?body instanceof FormData?body:JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};};
 try{
  const loc={tractate:'sanhedrin',chapter:9,daf:80,amud:'a'};
  assert.equal((await req('/documents','POST',{...loc,chapter:1})).status,400);
  const created=await req('/documents','POST',{...loc,title:'חידוש בסנהדרין',html:'<p>קושיה על <strong>רש״י</strong></p><script>alert(1)</script>',tags:['קושיה']});assert.equal(created.status,201);const id=created.data.id;assert.ok(!created.data.html.includes('script'));assert.ok(created.data.text.includes('רש״י'));
  const update=await req('/documents/'+id,'PUT',{...created.data,html:'<p>תירוץ נפלא</p>',version:1});assert.equal(update.status,200);assert.equal(update.data.version,2);
  const stale=await req('/documents/'+id,'PUT',{...created.data,version:1});assert.equal(stale.status,409);
  const revisions=await req('/documents/'+id+'/revisions');assert.equal(revisions.data.length,1);assert.ok(revisions.data[0].html.includes('קושיה'));
  const exportRes=await fetch(base+'/api/documents/'+id+'/export');assert.equal(exportRes.status,200);const exported=Buffer.from(await exportRes.arrayBuffer());assert.equal(exported.subarray(0,2).toString(),'PK');
  const form=new FormData();for(const [k,v]of Object.entries(loc))form.append(k,v);form.append('file',new Blob([await Packer.toBuffer(new Document({sections:[{children:[new Paragraph({children:[new TextRun('חידוש מקובץ וורד')]} )]}]}))]),'my-notes.docx');const imported=await req('/import-word','POST',form);assert.equal(imported.status,201);assert.ok(imported.data.text.includes('חידוש מקובץ וורד'));assert.equal((await fetch(base+'/api/documents/'+imported.data.id+'/original')).status,200);
  const badForm=new FormData();for(const [k,v]of Object.entries(loc))badForm.append(k,v);badForm.append('file',new Blob(['bad']),'broken.docx');assert.equal((await req('/import-word','POST',badForm)).status,400);
  await req('/documents/'+id+'/trash','POST');assert.ok((await req('/documents/'+id)).data.deletedAt);await req('/documents/'+id+'/restore','POST');assert.equal((await req('/documents/'+id)).data.deletedAt,null);
  const backup=await req('/backup.json');assert.equal(backup.data.documents.length,2);const restored=await req('/restore-backup','POST',backup.data);assert.equal(restored.data.added,0);assert.equal(restored.data.skipped,2);
  const zip=await fetch(base+'/api/backup.zip');assert.equal(zip.status,200);assert.equal(Buffer.from(await zip.arrayBuffer()).subarray(0,2).toString(),'PK');
  const cross=await fetch(base+'/api/documents',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify(loc)});assert.equal(cross.status,403);
  const files=await fs.readdir(path.join(dir,'backups'));assert.ok(files.length);const disk=JSON.parse(await fs.readFile(path.join(dir,'library.json'),'utf8'));assert.equal(disk.documents.length,2);
  const reopened=await createApp(dir);const s2=reopened.listen(0,'127.0.0.1');await new Promise(r=>s2.once('listening',r));try{const persisted=await fetch('http://127.0.0.1:'+s2.address().port+'/api/documents').then(r=>r.json());assert.equal(persisted.length,2);assert.equal(persisted.find(d=>d.id===id).text,'תירוץ נפלא');}finally{await new Promise(r=>s2.close(r));}
 }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
test('sanitizer blocks active content and unsafe links',()=>{const h=clean('<svg><animate onbegin="alert(1)"></animate></svg><img src=x onerror=alert(1)><a href="javascript:alert(1)">click</a><p onclick="alert(1)">safe</p>');assert.ok(!/onerror|onclick|javascript:|<svg|<img/.test(h));assert.ok(h.includes('safe'));});
