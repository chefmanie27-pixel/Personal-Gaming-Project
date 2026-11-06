import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { effectScope } from "vue";
import { useAuthStore } from "../src/stores/auth";
import { useLibraryStore } from "../src/stores/library";
import { libraryClient } from "../src/services/library";
import { blankWorkspace, useWorkspaceStore, workspaceClient } from "../src/stores/workspace";
import { privateExportClient, deviceExport, type ExportFile } from "../src/services/privateExport";
import { usePrivateExport } from "../src/composables/usePrivateExport";
const storage=new Map<string,string>();
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}});
const reply=(config:any,data:any)=>({config,data,status:200,statusText:"OK",headers:{}});
const body=()=>JSON.stringify({format:"gamevault-private-data",formatVersion:1,exportedAt:"2026-11-06T10:00:00.000Z",source:{kind:"account",journalMode:"normalized"},consistency:{kind:"transaction-snapshot",workspaceVersion:1},data:{library:[],workspace:{profile:{name:"Private account",bio:""}},journal:Array.from({length:131},(_,id)=>({id,notes:"Private row "+id}))}});
async function setup(){storage.clear();setActivePinia(createPinia());const auth=useAuthStore();auth.token="alice";auth.user={id:"alice",email:"alice@example.invalid",role:"USER"};libraryClient.defaults.adapter=async c=>reply(c,{data:[]});workspaceClient.defaults.adapter=async c=>reply(c,{data:blankWorkspace(),version:0,journalMode:"normalized"});await useLibraryStore().connect("alice","alice");await useWorkspaceStore().connect("alice","alice");const files:ExportFile[]=[],scope=effectScope(),exporter=scope.run(()=>usePrivateExport(file=>files.push(file)))!;return{auth,files,scope,exporter};}
function gate(){let release!:(value:any)=>void,reject!:(reason:Error)=>void;const wait=new Promise<any>((a,b)=>{release=a;reject=b});return{wait,release,reject};}
const flush=()=>new Promise(r=>setTimeout(r,0));
test("device JSON reads saved source directly and flattens the full private journal without changing storage",()=>{
  storage.clear();const workspace=blankWorkspace(),game={id:"steam-1",slug:"steam-1",title:"Fixture",genres:["RPG"],platforms:["PC"],store:"Steam"};
  workspace.journal=Array.from({length:100},(_,i)=>({id:"legacy-"+i,game:game as any,date:"2026-11-06",kind:"session",minutes:60,notes:"Secret "+i,progress:"Private progress",tags:["Private"],spoiler:true,rating:null}));
  const raw=JSON.stringify(workspace);storage.set("gamevault_workspace_v1",raw);storage.set("gamevault_library_v1",JSON.stringify([{game,status:"Completed",favorite:true,rating:9,hours:100,notes:"Private library note",addedAt:"2026-01-01"}]));
  const file=deviceExport(localStorage),data=JSON.parse(file.body);assert.equal(data.source.kind,"device");assert.equal(data.data.journal.length,100);assert.equal(data.data.journal[99].notes,"Secret 99");assert.equal(data.data.library[0].notes,"Private library note");assert.equal("journal"in data.data.workspace,false);assert.equal(storage.get("gamevault_workspace_v1"),raw);assert.match(file.filename,/gamevault-private-device-/);
  storage.set("gamevault_workspace_v1",JSON.stringify({...workspace,journal:[null]}));assert.throws(()=>deviceExport(localStorage));
});
test("account export uses the complete server document, blocks pending duplicates and retries invalid responses",async()=>{
  const{scope,exporter,files}=await setup(),pending=gate();let calls=0;privateExportClient.defaults.adapter=async c=>{calls++;return reply(c,await pending.wait)};
  try{const first=exporter.start();assert.equal(await exporter.start(),false);assert.equal(calls,1);pending.release("not JSON");assert.equal(await first,false);assert.equal(files.length,0);assert.ok(exporter.error.value);privateExportClient.defaults.adapter=async c=>reply(c,body());assert.equal(await exporter.start(),true);assert.equal(JSON.parse(files[0].body).data.journal.length,131);assert.equal(exporter.error.value,"");}finally{pending.release(body());scope.stop();}
});
test("logout, source changes and disposal discard late private downloads",async()=>{
  for(const change of ["logout","source","dispose"]){const{auth,scope,exporter,files}=await setup(),pending=gate();privateExportClient.defaults.adapter=async c=>reply(c,await pending.wait);const request=exporter.start();await flush();if(change==="logout")auth.logout();else if(change==="source")exporter.source.value="device";else scope.stop();pending.release(body());assert.equal(await request,false);assert.equal(files.length,0);scope.stop();}
});
test("an old failure cannot clear a new same-account export or replace its status",async()=>{
  const{auth,scope,exporter,files}=await setup(),old=gate(),fresh=gate();let calls=0;privateExportClient.defaults.adapter=async c=>reply(c,await(calls++===0?old.wait:fresh.wait));
  try{const first=exporter.start();await flush();auth.logout();auth.token="alice";auth.user={id:"alice",email:"alice@example.invalid",role:"USER"};const second=exporter.start();await flush();old.reject(new Error("Old account failure"));await first;assert.equal(exporter.busy.value,true);assert.equal(exporter.error.value,"");fresh.release(body());assert.equal(await second,true);assert.equal(files.length,1);assert.equal(exporter.busy.value,false);}finally{old.release(body());fresh.release(body());scope.stop();}
});
