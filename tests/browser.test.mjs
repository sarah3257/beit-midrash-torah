import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server.mjs';
import { Document, Packer, Paragraph } from 'docx';

test('browser: writing, navigation, search, Word import, restore and mobile layout',{timeout:120000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'torah-browser-'));const app=await createApp(dir);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base);await expect(page.getByRole('heading',{name:'ברוכים הבאים לבית המדרש'})).toBeVisible();
  await fs.mkdir(new URL('../screenshots/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../screenshots/home.png',import.meta.url)),fullPage:true});
  await page.locator('.hero [data-action="new"]').click();await page.locator('#new-title').fill('קושיה בדברי רש״י');await page.locator('#loc-tractate').selectOption('sanhedrin');await page.locator('#loc-daf').fill('פ');await expect(page.locator('#loc-chapter')).toHaveValue('9');await page.locator('#location-form button[type="submit"]').click();
  await expect(page.locator('#document-title')).toHaveValue('קושיה בדברי רש״י');await page.locator('#rich-editor').fill('יש לעיין בדברי רש״י בסוגיה. תירוץ מחודש בדין הנשרפין.');await page.locator('#tags').fill('רש״י, קושיה');await expect(page.locator('#save-state')).toContainText('כל השינויים נשמרו');
  const docURL=page.url();await page.reload();await expect(page.locator('#rich-editor')).toContainText('תירוץ מחודש');await expect(page.locator('#tags')).toHaveValue('רש״י, קושיה');
  await page.locator('[data-action="favorite"]').click();await expect(page.locator('#save-state')).toContainText('כל השינויים נשמרו');
  await page.locator('#search').fill('תירוץ מחודש');await expect(page.locator('.doc-card h3')).toHaveText('קושיה בדברי רש״י');await page.locator('.doc-card a').click();await expect(page.locator('#rich-editor')).toBeVisible();
  await page.locator('#rich-editor').fill('גרסה חדשה של החידוש');await expect(page.locator('#save-state')).toContainText('כל השינויים נשמרו');await page.locator('[data-action="revisions"]').click();await page.locator('[data-revision="0"]').click();await expect(page.locator('#revision-detail')).toContainText('תירוץ מחודש');await page.locator('#restore-version').click();await expect(page.locator('#rich-editor')).toContainText('תירוץ מחודש');await expect(page.locator('#save-state')).toContainText('כל השינויים נשמרו');
  await page.locator('#search').fill('סנהדרין פ');const jumpLink=page.locator('main .search-section .btn');await expect(jumpLink).toHaveText('סנהדרין · פ ע״א');await jumpLink.click();await expect(page).toHaveURL(/#page\/sanhedrin\/80\/a/);await expect(page.locator('h1')).toContainText('דף פ');await expect(page.locator('.doc-card h3')).toHaveText('קושיה בדברי רש״י');
  const fileChooser=page.waitForEvent('filechooser');await page.locator('[data-action="import-word"]').click();const chooser=await fileChooser;await chooser.setFiles({name:'חידוש נוסף.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('חידוש מיובא מתוך מסמך Word')]}]}))});await expect(page.locator('#rich-editor')).toContainText('חידוש מיובא');await expect(page.locator('#document-title')).toHaveValue('חידוש נוסף');
  const downloadEvent=page.waitForEvent('download');await page.locator('[data-action="export-docx"]').click();const download=await downloadEvent;assert.ok(download.suggestedFilename().endsWith('.docx'));
  await page.locator('[data-action="trash"]').click();await page.locator('#confirm-trash').click();await expect(page.locator('h1')).toHaveText('סל המחזור');await page.locator('[data-restore]').click();await expect(page.locator('#rich-editor')).toContainText('חידוש מיובא');
  await page.goto(docURL);await expect(page.locator('#rich-editor')).toBeVisible();await page.screenshot({path:fileURLToPath(new URL('../screenshots/editor.png',import.meta.url)),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.goto(base);await expect(page.locator('.hero')).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);await page.screenshot({path:fileURLToPath(new URL('../screenshots/mobile.png',import.meta.url)),fullPage:true});
  await page.goto(docURL);await expect(page.locator('#rich-editor')).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
  assert.deepEqual(errors,[]);
 }catch(e){console.log('Browser errors:',errors,'URL:',page.url(),'Toast:',await page.locator('#toast').textContent());await page.screenshot({path:fileURLToPath(new URL('../screenshots/failure.png',import.meta.url)),fullPage:true});throw e;}finally{await browser.close();await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
