import { test } from "node:test";
import assert from "node:assert/strict";
import { blankWorkspace } from "../src/stores/workspace";
import { parsePrivateBackup, comparePrivateBackups } from "../src/utils/restorePreview";
const game={id:"steam-1",slug:"steam-1",title:"Same title",store:"Steam",genres:["RPG"],platforms:["PC"],cover:"",hero:"",storeUrl:"https://store.steampowered.com/app/1/"};
const id=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const journal=(n:number)=>({id:id(n),game,date:"2026-11-06",kind:"session",minutes:60,notes:"Private "+n,progress:"",tags:[],spoiler:false,rating:null});
function doc(kind:"account"|"device"="account",rows:any[]=[]){const{journal:_,...workspace}=blankWorkspace();return{format:"gamevault-private-data",formatVersion:1,exportedAt:"2026-11-06T10:00:00.000Z",source:{kind,journalMode:kind==="device"?"legacy":"normalized"},consistency:{kind:kind==="device"?"device-read":"transaction-snapshot",workspaceVersion:kind==="device"?null:3},data:{library:[] as any[],workspace,journal:rows}};}
const library=(slug="steam-1")=>({game:{...game,id:slug,slug},status:"Completed",favorite:true,rating:9,hours:12,notes:"Private library note",addedAt:"2026-01-01T00:00:00.000Z"});
test("restore preview compares complete normalized journals beyond 2000 rows without truncation",()=>{
  const raw=JSON.stringify(doc("account",Array.from({length:2101},(_,n)=>journal(n))));const source=parsePrivateBackup(raw),target=parsePrivateBackup(JSON.stringify(doc("account",Array.from({length:53},(_,n)=>journal(n)))));
  const summary=comparePrivateBackups(source,target);assert.deepEqual(summary.counts[1],{label:"Journal entries",inFile:2101,inDestination:53,add:2048,keep:53});assert.deepEqual(summary.issues,[]);assert.equal(JSON.stringify(doc("account",Array.from({length:2101},(_,n)=>journal(n)))),raw);
  const device=comparePrivateBackups(source,parsePrivateBackup(JSON.stringify(doc("device"))));assert.equal(device.counts[1].inFile,2101);assert.ok(device.issues.some(s=>s.includes("2,000-entry")));
});
test("conflict counts use saved keys, preserve destination records and do not mutate either snapshot",()=>{
  const a=doc("account",[journal(1)]),b=doc("account",[journal(1)]);a.data.library=[library(),library("gog-1")];b.data.library=[{...library(),notes:"Destination wins"}];
  for(const d of[a,b]){d.data.workspace.collections=[{id:id(2),name:"Collection"}];d.data.workspace.metadata={"steam-1":{completedAt:null,priority:"Normal",collectionIds:[id(2)]}};d.data.workspace.watches=[{game:game as any,followedAt:"2026-01-01T00:00:00.000Z"}];d.data.workspace.goals=[{id:id(3),title:"Goal",kind:"sessions",target:2,start:"2026-01-01",end:"2026-12-31"}];d.data.workspace.preferences.recommendationFeedback={"steam-1":{choice:"interested",title:"Same title",genres:["RPG"],at:"2026-01-01T00:00:00.000Z"}};d.data.workspace.preferences.priceAlertRules={"rule-1":{mode:"target",percent:20,cooldownHours:24}};}
  const source=parsePrivateBackup(JSON.stringify(a)),target=parsePrivateBackup(JSON.stringify(b)),before=JSON.stringify([source,target]),summary=comparePrivateBackups(source,target);
  assert.equal(summary.counts[0].keep,1);assert.equal(summary.counts[0].add,1);assert.ok(summary.counts.slice(1).every(r=>r.keep===1&&r.add===0));assert.equal(JSON.stringify([source,target]),before);assert.equal(summary.destinationProfileKept,true);
});
test("malformed backup versions, duplicate IDs, references, URLs and impossible dates fail closed",()=>{
  const invalid:any[]=[];let d:any=doc();d.formatVersion=2;invalid.push(d);d=doc("account",[journal(1),journal(1)]);invalid.push(d);d=doc();d.data.workspace.journal=[];invalid.push(d);d=doc();d.data.library=[library(),library()];invalid.push(d);d=doc();d.data.workspace.metadata={"steam-1":{completedAt:null,priority:"Normal",collectionIds:["missing"]}};invalid.push(d);d=doc("account",[{...journal(1),date:"2026-02-30"}]);invalid.push(d);d=doc();d.exportedAt="2026-02-30T00:00:00.000Z";invalid.push(d);d=doc();d.data.library=[{...library(),addedAt:"2026-02-30"}];invalid.push(d);d=doc("account",[{...journal(1),game:{...game,storeUrl:"javascript:alert(1)"}}]);invalid.push(d);
  for(const value of invalid)assert.throws(()=>parsePrivateBackup(JSON.stringify(value)));
  const unsafe=JSON.stringify(doc()).replace('"metadata":{}','"metadata":{"__proto__":{}}');assert.throws(()=>parsePrivateBackup(unsafe));
  const large=doc();large.data.journal=Array(100001).fill(null);assert.throws(()=>parsePrivateBackup(JSON.stringify(large)),/too large/);
});
test("readable legacy data stays intact while account incompatibilities are reported explicitly",()=>{
  const d:any=doc("device",[{...journal(1),id:"legacy-row",notes:"",game:{...game,cover:"http://example.invalid/image.jpg"}}]);d.data.library=[{...library(),addedAt:"2026-01-01"}];d.data.workspace.collections=[{id:"legacy-list",name:"Collection"}];
  const source=parsePrivateBackup(JSON.stringify(d)),before=JSON.stringify(source),summary=comparePrivateBackups(source,parsePrivateBackup(JSON.stringify(doc())));
  assert.equal(summary.legacyIds,2);assert.ok(summary.issues.some(s=>s.includes("legacy identifiers")));assert.ok(summary.issues.some(s=>s.includes("empty notes")));assert.ok(summary.issues.some(s=>s.includes("account-schema")));assert.ok(summary.issues.some(s=>s.includes("added dates")));assert.equal(JSON.stringify(source),before);
  assert.deepEqual(comparePrivateBackups(source,parsePrivateBackup(JSON.stringify(doc("device")))).issues,[]);
});
