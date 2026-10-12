export const cloudState={local:true,user:null,lastSync:null};
let ui,ready=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);

async function request(url,body){
 const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(response.status===429?'יותר מדי ניסיונות. המתן דקה ונסה שוב.':result.error||result.message||'הפעולה לא הושלמה');
 return result;
}
export async function initializeCloud(options){
 ui=options;
 const runtime=await request('/api/runtime');cloudState.local=runtime.local;
 if(cloudState.local)Object.assign(cloudState,await request('/api/cloud/status'));
 else{cloudState.ready=runtime.ready;if(runtime.ready){const session=await request('/api/auth/get-session');cloudState.user=session?.user||null;}}
 drawTools();ready=true;
 if(!cloudState.local&&!cloudState.user){showWelcome();return false;}
 return true;
}
function drawTools(){
 let tools=$('#cloud-tools');if(!tools){tools=document.createElement('div');tools.id='cloud-tools';tools.className='cloud-tools';$('.header-end').prepend(tools);}
 tools.innerHTML=cloudState.local?'<button class="btn small primary" id="sync-open">העלה עדכונים לאתר</button>':'<a class="btn small primary" href="/install.html" target="_blank">הורד והתקן את התוכנה</a>';
 tools.innerHTML+='<button class="btn small" id="account-open">'+(cloudState.user?esc(cloudState.user.name||cloudState.user.email):'חשבון בענן')+'</button>';
 $('#account-open').onclick=()=>account();if($('#sync-open'))$('#sync-open').onclick=()=>account();
 if(!cloudState.local){const foot=$('.sidebar-foot');if(foot)foot.innerHTML='הספרייה הפרטית שלך בענן<strong>שמירה בחשבון שלך</strong><a href="/install.html" target="_blank">התקנת התוכנה במחשב</a>';}
}
export function refreshCloudTools(){if(ready)drawTools();}
function showWelcome(){
 $('#sidebar').innerHTML='';
 $('#main').innerHTML='<section class="hero"><div><div class="eyebrow">מקום למחשבה. בית לחידוש.</div><h1>בית המדרש שלי</h1><p>כל חידושי התורה שלך, מסודרים לפי מסכת, פרק ודף או לפי נושאים משלך.<br>כותבים בענן ובמחשב, וחוזרים בדיוק למקום שבו עצרת.</p><div class="button-row"><button class="btn primary" id="welcome-login">כניסה לספרייה שלי</button><a class="btn" href="/install.html">הורד והתקן את התוכנה</a></div><p>ספרייה אישית לכל משתמש · תוכנה לעבודה ללא אינטרנט · סנכרון ידני</p></div></section>';
 $('#welcome-login').onclick=()=>account();
}
async function account(signup=false){
 if(!await ui.flush())return;
 if(!cloudState.local&&cloudState.ready===false){ui.showModal('<h2>ספריית הענן בהקמה</h2><p>נדרש להשלים את חיבור מסד הנתונים. בינתיים אפשר להתקין את התוכנה ולכתוב במחשב, גם ללא אינטרנט.</p><a class="btn primary" href="/install.html">הורדה והוראות התקנה</a>');return;}
 if(cloudState.user){
  ui.showModal(`<h2>${cloudState.local?'העלאת עדכונים לאתר':'החשבון שלי'}</h2><p>${esc(cloudState.user.email)}</p>${cloudState.local?`<p>הסנכרון יעלה את כתבי הספרייה המקומית לחשבון הזה, ויוריד למחשב חידושים שנכתבו בענן. כשיש עריכה בשני מקומות נשמרים שני עותקים.</p><p class="sync-status">${cloudState.lastSync?'סנכרון אחרון: '+esc(new Date(cloudState.lastSync).toLocaleString('he-IL')):'הספרייה הזו עדיין לא סונכרנה מהמחשב הזה.'}</p><button class="btn primary" id="sync-now">העלה עדכונים לאתר וסנכרן</button><p><a href="${esc(cloudState.url)}" target="_blank" rel="noopener noreferrer">פתיחת האתר בענן</a></p>`:'<p>הכתבים נשמרים בענן בחשבון שלך. במחשב אפשר להמשיך לכתוב גם ללא אינטרנט.</p>'}<p id="cloud-feedback" role="status"></p><button class="btn small" id="cloud-logout">התנתקות מהחשבון</button>`);
  $('#cloud-logout').onclick=async()=>{try{await request(cloudState.local?'/api/cloud/logout':'/api/auth/sign-out',{});cloudState.user=null;ui.closeModal();drawTools();if(!cloudState.local)location.reload();else ui.toast('נותקת מהענן. הכתבים המקומיים נשארו במחשב.');}catch(e){ui.toast(e.message);}};
  if($('#sync-now'))$('#sync-now').onclick=syncNow;
  return;
 }
 ui.showModal(`<h2>${signup?'יצירת חשבון בענן':'כניסה לחשבון בענן'}</h2><p>${cloudState.local?'הכתיבה במחשב זמינה גם ללא חשבון. התחבר רק כדי לסנכרן עם האתר.':'התחבר כדי לפתוח את הספרייה הפרטית שלך.'}</p><form class="account-form" id="account-form">${signup?'<label for="account-name">שם לתצוגה</label><input class="field" id="account-name" name="name" maxlength="80" required autocomplete="name">':''}<label for="account-email">כתובת דוא״ל</label><input class="field" id="account-email" name="email" type="email" dir="ltr" required autocomplete="email"><label for="account-password">סיסמה</label><input class="field" id="account-password" name="password" type="password" dir="ltr" minlength="12" maxlength="128" required autocomplete="${signup?'new-password':'current-password'}"><small>לפחות 12 תווים. שמור את הסיסמה במקום בטוח; שחזור בדוא״ל אינו פעיל עדיין.</small><p id="cloud-feedback" role="alert"></p><button class="btn primary" type="submit">${signup?'יצירת חשבון':'כניסה'}</button><button class="btn" id="account-switch" type="button">${signup?'כבר יש לי חשבון':'אין לי חשבון — יצירת חשבון חינמי'}</button></form>`);
 $('#account-switch').onclick=()=>account(!signup);
 $('#account-form').onsubmit=async event=>{
  event.preventDefault();const form=event.target,button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   const values=Object.fromEntries(new FormData(form));
   const result=await request(cloudState.local?'/api/cloud/login':'/api/auth/'+(signup?'sign-up/email':'sign-in/email'),{...values,signup});
   cloudState.user=result.user;drawTools();ui.closeModal();
   if(cloudState.local)account();else{location.hash='#home';await ui.reload();}
  }catch(e){$('#cloud-feedback').textContent=e.message;}finally{button.disabled=false;}
 };
}
async function syncNow(){
 if(!await ui.flush())return;
 const button=$('#sync-now');button.disabled=true;$('#cloud-logout').disabled=true;
 $('#cloud-feedback').textContent='מסנכרן כתבים וקובצי Word… המתן לסיום לפני סגירת התוכנה.';
 // Hold the modal open while applying the downloaded library.
 const dialog=$('#dialog'),cancel=e=>e.preventDefault();dialog.dataset.syncing='true';dialog.addEventListener('cancel',cancel);
 const close=dialog.querySelector('[data-action="close-modal"]');if(close)close.disabled=true;
 try{
  const result=await request('/api/cloud/sync',{});cloudState.lastSync=result.lastSync;
  $('#cloud-feedback').textContent=`הסנכרון הושלם. ${result.uploaded} חידושים הועלו · ${result.documents} חידושים בענן.${result.conflicts?' נשמרו '+result.conflicts+' עותקים נוספים עקב עריכה בשני מקומות.':''}`;
  await ui.reload();ui.toast('הסנכרון הושלם בהצלחה');
 }catch(e){$('#cloud-feedback').textContent=e.message;}
 finally{delete dialog.dataset.syncing;dialog.removeEventListener('cancel',cancel);button.disabled=false;$('#cloud-logout').disabled=false;if(close)close.disabled=false;}
}

document.addEventListener('click',async event=>{
 const link=event.target.closest('a[href$="/original"]');
 if(cloudState.local||!link)return;
 event.preventDefault();
 const id=link.getAttribute('href').split('/')[3];
 try{
  const chunks=[];let offset=0,total;
  do{const part=await request('/api/sync-original/'+id+'?offset='+offset);total=part.total;if(!total)throw Error('קובץ המקור עדיין לא סונכרן');const bytes=Uint8Array.from(atob(part.data),c=>c.charCodeAt(0));if(!bytes.length)throw Error('הורדת הקובץ לא הושלמה');chunks.push(bytes);offset+=bytes.length;}while(offset<total);
  const url=URL.createObjectURL(new Blob(chunks,{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='original.docx';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){ui.toast(e.message);}
});
