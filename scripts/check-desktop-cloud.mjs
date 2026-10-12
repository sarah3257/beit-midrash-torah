import {_electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {auth} from '../cloud/auth.mjs';
import {sql} from '../cloud/db.mjs';

const email='desktop-check-'+randomUUID()+'@example.com',password=randomBytes(24).toString('base64url');
const fixture=await auth.api.signUpEmail({body:{email,password,name:'בדיקת תוכנה'}});
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'torah-desktop-cloud-'));
const exe=path.resolve('artifacts/win-unpacked/BeitMidrash.exe');
const env={...process.env,TORAH_DESKTOP_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
const original=await fs.readFile('data/library.json'),hash=b=>createHash('sha256').update(b).digest('hex');
let electron;
try{
 electron=await _electron.launch({executablePath:exe,env,timeout:45000});let win=await electron.firstWindow();
 await expect(win.locator('h1').first()).toHaveText('ברוכים הבאים לבית המדרש');
 await win.locator('.hero [data-action="new"]').click();await win.locator('#loc-tractate').selectOption('other');await win.locator('#loc-topic').fill('תוכנה וענן');await win.locator('#new-title').fill('חידוש מהתוכנה המותקנת');await win.locator('#location-form [type="submit"]').click();
 await win.locator('#rich-editor').fill('נכתב במחשב ללא תלות בענן');await expect(win.locator('#save-state')).toContainText('כל השינויים נשמרו');
 await win.locator('#sync-open').click();await win.locator('#account-email').fill(email);await win.locator('#account-password').fill(password);await win.locator('#account-form [type="submit"]').click();
 await expect(win.locator('#sync-now')).toBeVisible({timeout:20000});await win.locator('#sync-now').click();await expect(win.locator('#cloud-feedback')).toContainText('הסנכרון הושלם',{timeout:90000});
 const session=JSON.parse(await fs.readFile(path.join(dir,'.cloud-session.json'),'utf8'));
 assert.equal(session.encrypted,true);assert.equal(session.user.id,fixture.user.id);
 const remote=await sql`SELECT library FROM torah_libraries WHERE user_id=${fixture.user.id}`;assert.equal(remote[0].library.documents.length,1);assert.equal(remote[0].library.documents[0].title,'חידוש מהתוכנה המותקנת');
 await win.locator('[data-action="close-modal"]').click();await electron.close();electron=null;
 electron=await _electron.launch({executablePath:exe,env,timeout:45000});win=await electron.firstWindow();await win.locator('#sync-open').click();await expect(win.locator('#dialog-content')).toContainText(email);await expect(win.locator('#sync-now')).toBeVisible();
 await win.locator('#cloud-logout').click();await expect.poll(async()=>{try{await fs.access(path.join(dir,'.cloud-session.json'));return false;}catch{return true;}}).toBe(true);
 assert.equal(hash(original),hash(await fs.readFile('data/library.json')));
 console.log('PASS: packaged desktop writing, cloud login, manual sync via button, encrypted session, restart and logout; original library unchanged.');
}finally{if(electron)await electron.close();await sql`DELETE FROM "user" WHERE id=${fixture.user.id}`;await sql.end();assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'torah-desktop-cloud-'));await fs.rm(dir,{recursive:true,force:true});}
