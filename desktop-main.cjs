const { app, BrowserWindow, Menu, dialog, shell, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
let window, ownedServer, appOrigin;
const testDir = process.env.TORAH_DESKTOP_TEST_DATA_DIR;
// Desktop always uses the local server, even when launched from a cloud CLI environment.
delete process.env.VERCEL;
if (testDir) app.setPath('userData', path.join(testDir, 'electron-profile'));
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.whenReady().then(start).catch(error=>{dialog.showErrorBox('לא ניתן לפתוח את בית המדרש',error.message);app.quit();});
}
async function status(url) {
 try {const r=await fetch(url+'/api/status',{signal:AbortSignal.timeout(1800)});if(!r.ok)return null;return await r.json();}catch{return null;}
}
async function start() {
 let dataDir;
 if(testDir) dataDir=testDir;
 else if(app.isPackaged){
  const persistentConfig=path.join(app.getPath('userData'),'desktop-config.json');
  const legacyConfig=path.join(path.dirname(process.execPath),'desktop-config.json');
  const configPath=fs.existsSync(persistentConfig)?persistentConfig:legacyConfig;
  dataDir=fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/, '')).dataDir:path.join(app.getPath('userData'),'library');
  if(configPath===legacyConfig&&fs.existsSync(legacyConfig)){
   fs.mkdirSync(app.getPath('userData'),{recursive:true});
   fs.writeFileSync(persistentConfig,JSON.stringify({dataDir},null,2));
  }
 }else dataDir=path.join(__dirname,'data');
 dataDir=path.resolve(dataDir);
 const base='http://127.0.0.1:4318';
 const existing=await status(base);
 if(existing?.local===true&&typeof existing.dataDir==='string'&&path.resolve(existing.dataDir).toLowerCase()===dataDir.toLowerCase())appOrigin=base;
 else {
  const {createApp}=await import(pathToFileURL(path.join(__dirname,'server.mjs')).href);
  const secretCodec=safeStorage.isEncryptionAvailable()?{encode:s=>safeStorage.encryptString(s).toString('base64'),decode:s=>safeStorage.decryptString(Buffer.from(s,'base64'))}:undefined;
  const webApp=await createApp(dataDir,{secretCodec});
  // A separate library or another application may already use 4318.
  // Let Windows assign a free port instead of stopping that application.
  await new Promise((resolve,reject)=>{ownedServer=webApp.listen(0,'127.0.0.1',resolve);ownedServer.once('error',reject);});
  appOrigin='http://127.0.0.1:'+ownedServer.address().port;
 }
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'קובץ',submenu:[{label:'פתיחת תיקיית הכתבים',click:()=>shell.openPath(dataDir)},{type:'separator'},{label:'סגירה',role:'quit'}]},
  {label:'עריכה',submenu:[{label:'ביטול',role:'undo'},{label:'ביצוע חוזר',role:'redo'},{type:'separator'},{label:'גזירה',role:'cut'},{label:'העתקה',role:'copy'},{label:'הדבקה',role:'paste'},{label:'בחירת הכול',role:'selectAll'}]},
  {label:'תצוגה',submenu:[{label:'הגדלה',role:'zoomIn'},{label:'הקטנה',role:'zoomOut'},{label:'גודל מקורי',role:'resetZoom'},{type:'separator'},{label:'מסך מלא',role:'togglefullscreen'}]}
 ]));
 window=new BrowserWindow({width:1440,height:1000,minWidth:800,minHeight:600,title:'בית המדרש שלי',backgroundColor:'#f8f7f3',show:false,icon:path.join(__dirname,'public','app.ico'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 window.removeMenu();
 window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==appOrigin){event.preventDefault();if(/^https?:\/\//.test(url))shell.openExternal(url);}});
 window.webContents.on('will-prevent-unload',async event=>{
  const result=await dialog.showMessageBox(window,{type:'warning',title:'שינויים שלא נשמרו',message:'יש שינויים שעדיין לא נשמרו.',detail:'הישאר בתוכנה עד להופעת ההודעה „כל השינויים נשמרו”.',buttons:['המשך כתיבה','סגירה בכל זאת'],defaultId:0,cancelId:0,noLink:true});
  if(result.response===1){window.webContents.removeAllListeners('will-prevent-unload');window.destroy();}
 });
 window.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
 window.webContents.session.on('will-download',(event,item)=>{
  if(!item.getURL().startsWith(appOrigin+'/api/')){event.preventDefault();return;}
  item.pause();
  const file=dialog.showSaveDialogSync(window,{title:'שמירת קובץ',defaultPath:path.join(app.getPath('downloads'),item.getFilename())});
  if(!file){item.cancel();return;}item.setSavePath(file);item.resume();
 });
 window.once('ready-to-show',()=>window.show());
 window.on('closed',()=>{window=null;});
 await window.loadURL(appOrigin);
}
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{if(ownedServer)ownedServer.close();});
