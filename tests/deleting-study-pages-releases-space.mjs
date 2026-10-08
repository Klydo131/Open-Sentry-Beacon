// Execute the actual adapter with a controlled backend; no accounts or network.
import fs from 'node:fs';import assert from 'node:assert/strict';import { transformSync } from 'esbuild';import * as Y from 'yjs';
const url=new URL('../node_modules/yjs/dist/yjs.mjs',import.meta.url).href;
const ts=fs.readFileSync(new URL('../lib/study/doc-source.ts',import.meta.url),'utf8').replace("from 'yjs'",`from '${url}'`);
const {SupabaseDocSource}=await import(`data:text/javascript;base64,${Buffer.from(transformSync(ts,{loader:'ts',format:'esm'}).code).toString('base64')}`);
const pending=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const rows=new Map();let delayInsert=null, deleteFailure=false;
const db={from(table){assert.equal(table,'study_docs');let action='',value,filters={};
 const builder={select(){if(!action)action='select';return this},eq(k,v){filters[k]=v;return this},insert(v){action='insert';value=v;return this},update(v){action='update';value=v;return this},delete(){action='delete';return this},maybeSingle(){return execute()},then(a,b){return execute().then(a,b)}};
 async function execute(){
  const key=filters.doc_id??value?.doc_id;
  if(action==='insert' && delayInsert)await delayInsert.promise;
  const row=rows.get(key);
  if(action==='select')return {data:row??null,error:null};
  if(action==='delete'){if(deleteFailure)throw new Error('Fictional connection failure');rows.delete(key);return {error:null};}
  if(action==='insert'){if(row)return {error:{code:'23505'}};rows.set(key,{...value,version:1});return {error:null};}
  if(!row || (filters.version!==undefined && filters.version!==row.version))return {data:[],error:null};
  rows.set(key,{...row,...value});return {data:[{doc_id:key}],error:null};
 }return builder;
}};
const source=new SupabaseDocSource(db,'fictional-owner','fictional-room');
const doc=new Y.Doc();doc.getText('notes').insert(0,'a'.repeat(10000));await source.push('page',Y.encodeStateAsUpdate(doc));
const before=rows.get('page').state.length;doc.getText('notes').delete(0,10000);await source.push('page',Y.encodeStateAsUpdate(doc));
assert(rows.get('page').state.length<before/10,'deleting text compacts stored payload');
const restored=new Y.Doc();Y.applyUpdate(restored,Buffer.from(rows.get('page').state,'base64'));assert.equal(restored.getText('notes').toString(),'');
// Two writers still merge independent updates after compaction.
const left=new Y.Doc(),right=new Y.Doc();Y.applyUpdate(left,Y.encodeStateAsUpdate(restored));Y.applyUpdate(right,Y.encodeStateAsUpdate(restored));
left.getText('notes').insert(0,'left');right.getText('notes').insert(0,'right');await Promise.all([source.push('page',Y.encodeStateAsUpdate(left)),source.push('page',Y.encodeStateAsUpdate(right))]);
const joined=new Y.Doc();Y.applyUpdate(joined,Buffer.from(rows.get('page').state,'base64'));assert(joined.getText('notes').toString().includes('left'));assert(joined.getText('notes').toString().includes('right'));
// A write already sent finishes before deletion. Later queued writes cannot recreate it.
delayInsert=pending();const writing=source.push('pending',Y.encodeStateAsUpdate(left));
await new Promise(r=>setImmediate(r));const deleting=source.delete('pending');const late=source.push('pending',Y.encodeStateAsUpdate(right));delayInsert.resolve();await Promise.all([writing,deleting,late]);delayInsert=null;assert(!rows.has('pending'));
await source.push('pending',Y.encodeStateAsUpdate(left));assert(!rows.has('pending'));
// A failed deletion keeps the page writable and available for retry.
deleteFailure=true;await assert.rejects(source.delete('page'),/connection failure/);deleteFailure=false;
await source.push('page',Y.encodeStateAsUpdate(left));assert(rows.has('page'));await source.delete('page');assert(!rows.has('page'));
for(const d of [doc,restored,left,right,joined])d.destroy();
console.log('PASS: text deletion compacts, concurrent edits survive, permanent page deletion drains writes, failure permits retry.');
