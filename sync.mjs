import {createHash} from 'node:crypto';

export const documentHash=d=>createHash('sha256').update(JSON.stringify([
 d.title,d.html,d.tags||[],!!d.favorite,d.kind||'bavli',d.topic||null,
 d.tractate||null,d.chapter||null,d.daf||null,d.amud||null,d.deletedAt||null,d.sourceName||null
])).digest('hex');

function conflictId(id,hash){const hex=createHash('sha256').update(id+hash).digest('hex').slice(0,32);return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`;}

// Called inside the account's database transaction. Repeated requests are safe.
export function mergeLibrary(store,entries,topics,validate){
 const mappings=[];let conflicts=0,uploaded=0;
 store.topics=[...new Set([...(store.topics||[]),...topics])];
 for(const {doc:raw,baseHash} of entries){
  const incoming=validate(raw), hash=documentHash(incoming);
  const remote=store.documents.find(d=>d.id===incoming.id);
  if(!remote){store.documents.push(incoming);uploaded++;continue;}
  const remoteHash=documentHash(remote);
  if(remoteHash===hash||hash===baseHash)continue;
  if(remoteHash===baseHash){
   const before={...remote,revisions:undefined};
   Object.assign(remote,incoming,{version:remote.version+1,revisions:[...(remote.revisions||[]),...incoming.revisions,before].slice(-50)});uploaded++;
  }else{
   const id=conflictId(incoming.id,hash);
   if(!store.documents.some(d=>d.id===id)){
    store.documents.push({...incoming,id,title:incoming.title+' — עותק מהסנכרון',version:1});
    conflicts++;
   }
   mappings.push({from:incoming.id,to:id});
  }
 }
 if(store.documents.length>10000)throw Object.assign(Error('הספרייה מוגבלת ל־10,000 מסמכים'),{status:413});
 return {conflicts,uploaded,mappings};
}

// Preserve any edits made on the device while the network request was running.
export function applyCloudSnapshot(store,snapshot,remote){
 for(const doc of remote.documents){
  const existing=store.documents.find(d=>d.id===doc.id);
  const before=snapshot.documents.find(d=>d.id===doc.id);
  if(!existing)store.documents.push(structuredClone(doc));
  else if(before&&documentHash(existing)===documentHash(before)){
   const revisions=[...(existing.revisions||[]),...(doc.revisions||[])];
   const seen=new Set();const merged=revisions.filter(r=>{const key=documentHash(r);if(seen.has(key))return false;seen.add(key);return true;}).slice(-50);
   Object.assign(existing,structuredClone(doc),{version:Math.max(existing.version,doc.version)+1,revisions:merged});
  }
 }
 store.topics=[...new Set([...store.topics,...remote.topics])];
}
