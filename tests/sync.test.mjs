import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {documentHash,mergeLibrary,applyCloudSnapshot} from '../sync.mjs';
import {createApp} from '../server.mjs';

const doc=(title='חידוש')=>({id:randomUUID(),title,html:'<p>תוכן</p>',tags:[],favorite:false,kind:'topic',topic:'אמונה',tractate:null,chapter:null,daf:null,amud:null,deletedAt:null,version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revisions:[]});
const library=()=>({format:1,documents:[],topics:[]});

test('sync: edits, conflicts, retries, deletions and concurrent device changes retain writing',()=>{
 const original=doc(),store={...library(),documents:[structuredClone(original)]};
 const baseHash=documentHash(original);
 const changed={...original,title:'גרסה מהמחשב'};
 assert.equal(mergeLibrary(store,[{doc:changed,baseHash}],['אמונה'],structuredClone).uploaded,1);
 assert.equal(store.documents[0].title,changed.title);
 assert.equal(mergeLibrary(store,[{doc:changed,baseHash}],[],structuredClone).conflicts,0);
 const elsewhere={...original,title:'גרסה ממחשב אחר'};
 const result=mergeLibrary(store,[{doc:elsewhere,baseHash}],[],structuredClone);
 assert.equal(result.conflicts,1);assert.equal(store.documents.length,2);
 assert.equal(store.documents[0].title,changed.title);
 assert.match(store.documents[1].title,/גרסה ממחשב אחר/);
 assert.equal(mergeLibrary(store,[{doc:elsewhere,baseHash}],[],structuredClone).conflicts,0);
 assert.equal(store.documents.length,2);
 const snapshot=structuredClone(store),local=structuredClone(snapshot);local.documents[0].html='<p>כתיבה בזמן הסנכרון</p>';
 const remote=structuredClone(store);remote.documents[0].title='עדכון בענן';
 applyCloudSnapshot(local,snapshot,remote);
 assert.equal(local.documents[0].html,'<p>כתיבה בזמן הסנכרון</p>');
 const deleted={...changed,deletedAt:new Date().toISOString()};
 mergeLibrary(store,[{doc:deleted,baseHash:documentHash(changed)}],[],structuredClone);
 assert.ok(store.documents[0].deletedAt);
});

test('cloud API: repository persistence, account isolation, origin validation and sanitized sync',async()=>{
 const stores=[library(),library()];
 function repository(index){let queue=Promise.resolve();return {read:async()=>structuredClone(stores[index]),change(fn){const task=queue.then(async()=>{const copy=structuredClone(stores[index]);const result=await fn(copy);stores[index]=copy;return result;});queue=task.catch(()=>{});return task;}};}
 const apps=await Promise.all([0,1].map(i=>createApp('/tmp/cloud-test',{repository:repository(i),origin:'https://test.example',user:{id:String(i)}})));
 const servers=apps.map(app=>app.listen(0,'127.0.0.1'));await Promise.all(servers.map(s=>new Promise(resolve=>s.on('listening',resolve))));
 const urls=servers.map(s=>'http://127.0.0.1:'+s.address().port);
 const post=(i,path,body,origin='https://test.example')=>fetch(urls[i]+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
 try{
  const incoming={...doc(),html:'<p>חידוש</p><script>steal()</script>'};
  assert.equal((await post(0,'/api/sync',{documents:[{doc:incoming}],topics:['אמונה']})).status,200);
  assert.equal((await post(0,'/api/topics',{name:'אסור'},'https://other.example')).status,403);
  const account0=await fetch(urls[0]+'/api/documents').then(r=>r.json()),account1=await fetch(urls[1]+'/api/documents').then(r=>r.json());
  assert.equal(account0.length,1);assert.equal(account1.length,0);
  const saved=await fetch(urls[0]+'/api/documents/'+incoming.id).then(r=>r.json());assert.equal(saved.html,'<p>חידוש</p>');
  const reopened=await createApp('/tmp/cloud-test',{repository:repository(0),origin:'https://test.example'});assert.ok(reopened);assert.equal(stores[0].documents.length,1);
  const original={...doc(),sourceName:'original.docx'};await post(0,'/api/sync',{documents:[{doc:original}],topics:[]});
 }finally{await Promise.all(servers.map(s=>new Promise(resolve=>{s.close(resolve);s.closeAllConnections();})));}
});
