import {chromium,expect} from '@playwright/test';
import {randomUUID,randomBytes} from 'node:crypto';
import {auth} from '../cloud/auth.mjs';
import {sql} from '../cloud/db.mjs';
import fs from 'node:fs/promises';

const email='browser-check-'+randomUUID()+'@example.com',password=randomBytes(24).toString('base64url');
const fixture=await auth.api.signUpEmail({body:{email,password,name:'בדיקת דפדפן'}});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('https://beit-midrash-torah.vercel.app');
 await expect(page.locator('#welcome-login')).toBeVisible();
 await fs.mkdir('screenshots',{recursive:true});
 await page.screenshot({path:'screenshots/cloud-welcome.png'});
 await page.locator('#welcome-login').click();
 page.on('response',async response=>{if(response.url().includes('/api/auth/sign-in'))console.log('Browser sign-in response:',response.status(),await response.text().then(t=>{try{const x=JSON.parse(t);return {code:x.code,message:x.message,user:!!x.user};}catch{return 'non-JSON'}}));});
 await page.locator('#account-email').fill(email);await page.locator('#account-password').fill(password);await page.locator('#account-form [type="submit"]').click();
 await expect(page.locator('h1').first()).toHaveText('ברוכים הבאים לבית המדרש',{timeout:20000}).catch(async error=>{console.log('Browser feedback:',await page.locator('#cloud-feedback').textContent().catch(()=>''));console.log('Browser errors:',errors);await page.screenshot({path:'screenshots/cloud-error.png'});throw error;});
 await page.locator('.hero [data-action="new"]').click();await page.locator('#loc-tractate').selectOption('other');await page.locator('#loc-topic').fill('נושא בענן');await page.locator('#new-title').fill('בדיקת כתיבה בענן');await page.locator('#location-form [type="submit"]').click();
 await page.locator('#rich-editor').fill('חידוש שנכתב באתר ונשמר בחשבון בענן');await expect(page.locator('#save-state')).toContainText('כל השינויים נשמרו');
 await page.reload();await expect(page.locator('#rich-editor')).toContainText('נשמר בחשבון בענן');
 await page.locator('#settings').click();await expect(page.locator('#dialog-content')).toContainText('הכתבים נשמרים בחשבון הפרטי שלך בענן');await page.locator('[data-action="close-modal"]').click();
 await page.goto('https://beit-midrash-torah.vercel.app/install.html');
 await expect(page.getByRole('link',{name:'הורד והתקן את התוכנה'})).toHaveAttribute('href',/releases\/latest\/download\/Beit-Midrash-Setup-/);
 await page.screenshot({path:'screenshots/cloud-install.png'});
 await page.goto('https://beit-midrash-torah.vercel.app');await expect(page.locator('h1').first()).toHaveText('ברוכים הבאים לבית המדרש',{timeout:20000});
 await page.locator('#account-open').click();await page.locator('#cloud-logout').click();await expect(page.locator('#welcome-login')).toBeVisible();
 assertNoErrors(errors);
 await page.setViewportSize({width:390,height:844});await page.reload();await expect(page.locator('#welcome-login')).toBeVisible();
 console.log('PASS: production browser cookie login, writing and reload, topics, cloud backup settings, download link, logout and mobile welcome.');
}finally{await browser.close();await sql`DELETE FROM "user" WHERE id=${fixture.user.id}`;await sql.end();process.exitCode=process.exitCode||0;}
function assertNoErrors(errors){if(errors.length)throw Error(errors.join('\n'));}
