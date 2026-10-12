import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
import {Document,Packer,Paragraph} from 'docx';
import {createApp} from '../server.mjs';

async function fixture(run){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'torah-topics-'));const app=await createApp(dir);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;try{await run({dir,base});}finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}}
test('topics: independent locations, moves, Word, ZIP and backup round-trip',async()=>fixture(async({base,dir})=>{
 const request=async(url,body)=>{const res=await fetch(base+'/api'+url,{method:body?'POST':'GET',headers:body instanceof FormData?{}:{'Content-Type':'application/json'},body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined});return {status:res.status,body:await res.json()};};
 assert.equal((await request('/topics',{name:'   '})).status,400);
 await request('/topics',{name:'  הלכות   שבת  '});await request('/topics',{name:'הלכות שבת'});await request('/topics',{name:'נושא ריק'});
 assert.deepEqual((await request('/topics')).body,['הלכות שבת','נושא ריק']);
 const created=await request('/documents',{kind:'topic',topic:'הלכות שבת',title:'בירור בהלכה',html:'<p>תוכן לפי נושא</p>'});assert.equal(created.status,201);let d=created.body;
 assert.equal(d.tractate,null);assert.equal(d.daf,null);assert.equal(d.topic,'הלכות שבת');
 assert.equal((await request('/documents',{kind:'topic',topic:''})).status,400);
 const update=async fields=>{const res=await fetch(base+'/api/documents/'+d.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...d,...fields})});assert.equal(res.status,200);d=await res.json();};
 await update({kind:'bavli',tractate:'sanhedrin',chapter:9,daf:80,amud:'a'});assert.equal(d.topic,null);
 await update({kind:'topic',topic:'אמונה'});assert.equal(d.tractate,null);assert.equal(d.daf,null);
 const form=new FormData();form.append('kind','topic');form.append('topic','הלכות שבת');form.append('file',new Blob([await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('ייבוא לפי נושא')]}]}))]),'topic.docx');const imported=await request('/import-word',form);assert.equal(imported.status,201);assert.equal(imported.body.topic,'הלכות שבת');
 assert.equal((await fetch(base+'/api/documents/'+d.id+'/export')).status,200);
 const zip=await fetch(base+'/api/backup.zip');assert.equal(zip.status,200);assert.equal(Buffer.from(await zip.arrayBuffer()).subarray(0,2).toString(),'PK');
 const backup=(await request('/backup.json')).body;assert.ok(backup.topics.includes('נושא ריק'));
 await fixture(async({base:other})=>{const res=await fetch(other+'/api/restore-backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(backup)});assert.equal(res.status,200);const docs=await fetch(other+'/api/documents').then(r=>r.json());assert.equal(docs.length,2);assert.equal(docs.find(x=>x.id===d.id).topic,'אמונה');assert.ok((await fetch(other+'/api/topics').then(r=>r.json())).includes('נושא ריק'));});
 const saved=JSON.parse(await fs.readFile(path.join(dir,'library.json'),'utf8'));assert.equal(saved.documents[0].revisions.length,2);
}));

test('topics browser: choose Other, save multiple documents, search, move and reopen',{timeout:90000},async()=>fixture(async({base})=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base);await page.locator('.hero [data-action="new"]').click();await page.locator('#new-title').fill('בירור בדיני שבת');await page.locator('#loc-tractate').selectOption('other');await expect(page.locator('#bavli-fields')).toBeHidden();await page.locator('#loc-topic').fill('הלכות שבת');await page.locator('#location-form [type="submit"]').click();
  await expect(page.locator('.editor-panel')).toContainText('הלכות שבת');await page.locator('#rich-editor').fill('חידוש בעניין מלאכת מחשבת');await expect(page.locator('#save-state')).toContainText('כל השינויים נשמרו');const first=page.url();
  await page.locator('.breadcrumbs a').last().click();await expect(page.locator('h1')).toHaveText('הלכות שבת');await page.locator('.page-head [data-action="new"]').click();await expect(page.locator('#loc-tractate')).toHaveValue('other');await expect(page.locator('#loc-topic')).toHaveValue('הלכות שבת');await page.locator('#new-title').fill('חידוש שני');await page.locator('#location-form [type="submit"]').click();await expect(page.locator('#rich-editor')).toBeVisible();
  await page.goto(base+'/#topics/'+encodeURIComponent('הלכות שבת'));await expect(page.locator('.doc-card')).toHaveCount(2);
  await page.locator('#search').fill('מלאכת מחשבת');await expect(page.locator('h1')).toHaveText('חיפוש בספרייה');await expect(page.locator('main .doc-card h3')).toHaveText('בירור בדיני שבת');await page.locator('main .doc-card a').click();await expect(page.locator('#rich-editor')).toContainText('מלאכת מחשבת');
  await page.locator('[data-action="move"]').click();await page.locator('#loc-tractate').selectOption('sanhedrin');await page.locator('#loc-daf').fill('פ');await page.locator('#location-form [type="submit"]').click();await expect(page.locator('.editor-panel')).toContainText('סנהדרין');await expect(page.locator('#rich-editor')).toContainText('מלאכת מחשבת');
  await page.locator('[data-action="move"]').click();await page.locator('#loc-tractate').selectOption('other');await page.locator('#loc-topic').fill('אמונה');await page.locator('#location-form [type="submit"]').click();await expect(page.locator('.editor-panel')).toContainText('אמונה');await page.reload();await expect(page.locator('.editor-panel')).toContainText('אמונה');
  await page.goto(base+'/#topics');await page.locator('.page-head [data-action="new-topic"]').click();await page.locator('#topic-name').fill('פרשת השבוע');await page.locator('#new-topic-form [type="submit"]').click();await expect(page.locator('h1')).toHaveText('פרשת השבוע');await page.reload();await expect(page.locator('h1')).toHaveText('פרשת השבוע');
  await page.goto(base+'/#all');await page.locator('#list-tractate').selectOption('topic:אמונה');await expect(page.locator('.doc-card')).toHaveCount(1);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}));
