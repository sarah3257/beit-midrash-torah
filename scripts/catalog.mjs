import fs from 'node:fs/promises';
const groups = [
 ['זרעים',['Berakhot']],
 ['מועד',['Shabbat','Eruvin','Pesachim','Yoma','Sukkah','Beitzah','Rosh Hashanah','Taanit','Megillah','Moed Katan','Chagigah']],
 ['נשים',['Yevamot','Ketubot','Nedarim','Nazir','Sotah','Gittin','Kiddushin']],
 ['נזיקין',['Bava Kamma','Bava Metzia','Bava Batra','Sanhedrin','Makkot','Shevuot','Avodah Zarah','Horayot']],
 ['קדשים',['Zevachim','Menachot','Chullin','Bekhorot','Arakhin','Temurah','Keritot','Meilah','Tamid']],
 ['טהרות',['Niddah']]
];
function point(ref) { const m=ref.match(/(\d+)([ab])(?::(\d+))?/); if(!m) throw Error('Invalid reference '+ref); return {daf:+m[1],amud:m[2],segment:m[3]?+m[3]:null}; }
const tractates=[];
for(const [seder,names] of groups) {
 for(const title of names) {
  let x; for(let attempt=0;attempt<3;attempt++){try{const r=await fetch('https://www.sefaria.org/api/index/'+encodeURIComponent(title));if(!r.ok)throw Error(r.status);x=await r.json();if(x.error)throw Error(x.error);break;}catch(e){if(attempt===2)throw e;}}
  const nodes=x.alts?.Chapters?.nodes; if(!nodes?.length) throw Error('Missing chapters: '+title);
  const chapters=nodes.map((n,i)=>{const [a,b]=n.wholeRef.split('-');const start=point(a);const end=b&&!/[ab]/.test(b)?{...start,segment:Number(b)}:point(b||a);return {id:i+1,name:n.heTitle||n.titles.find(t=>t.lang==='he')?.text,ref:n.wholeRef,start,end};});
  tractates.push({id:title.replaceAll(' ','-').toLowerCase(),title,name:x.heTitle,seder,chapters,start:chapters[0].start,end:chapters.at(-1).end});
  console.log(x.heTitle, chapters.length);
 }
}
await fs.mkdir(new URL('../public/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../public/catalog.json',import.meta.url),JSON.stringify({source:'https://www.sefaria.org',retrieved:new Date().toISOString(),note:'מיפוי 37 מסכתות הבבלי לפי ספריא. שקלים היא מסכת מן הירושלמי ואינה כלולה בקטלוג הבבלי הזה.',tractates},null,2));
console.log('Saved',tractates.length,'tractates');
