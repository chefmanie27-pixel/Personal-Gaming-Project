import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia,setActivePinia } from "pinia";
import { effectScope } from "vue";
import { useAuthStore } from "../src/stores/auth";
import { useLibraryStore } from "../src/stores/library";
import { libraryClient } from "../src/services/library";
import { blankWorkspace,useWorkspaceStore,workspaceClient } from "../src/stores/workspace";
import { privateExportClient } from "../src/services/privateExport";
import { useRestorePreview,type PreviewFile } from "../src/composables/useRestorePreview";
const storage=new Map<string,string>();let storageWrites=0;
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{storageWrites++;storage.set(k,v)},removeItem:(k:string)=>storage.delete(k)}});
const reply=(config:any,data:any)=>({config,data,status:200,statusText:"OK",headers:{}});
const game={id:"steam-1",slug:"steam-1",title:"Fixture",store:"Steam",genres:[],platforms:["PC"]};
function text(count=1){const{journal:_,...workspace}=blankWorkspace();return JSON.stringify({format:"gamevault-private-data",formatVersion:1,exportedAt:"2026-11-06T10:00:00.000Z",source:{kind:"account",journalMode:"normalized"},consistency:{kind:"transaction-snapshot",workspaceVersion:9},data:{library:[],workspace,journal:Array.from({length:count},(_,n)=>({id:"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),game,date:"2026-11-06",kind:"session",minutes:1,notes:"Private",progress:"",tags:[],spoiler:false,rating:null}))}});}
const file=(body=text()):PreviewFile=>{const bytes=new TextEncoder().encode(body);return{name:"private.json",size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer};};
function gate<T>(){let release!:(v:T)=>void,reject!:(e:Error)=>void;const wait=new Promise<T>((a,b)=>{release=a;reject=b});return{wait,release,reject};}
const flush=()=>new Promise(r=>setTimeout(r,0));
async function setup(){storage.clear();storageWrites=0;setActivePinia(createPinia());const auth=useAuthStore();auth.token="alice";auth.user={id:"alice",email:"alice@example.invalid",role:"USER"};workspaceClient.defaults.adapter=async c=>reply(c,{data:blankWorkspace(),version:0,journalMode:"normalized"});libraryClient.defaults.adapter=async c=>reply(c,{data:[]});await useWorkspaceStore().connect("alice","alice");await useLibraryStore().connect("alice","alice");const scope=effectScope(),preview=scope.run(()=>useRestorePreview())!;return{auth,scope,preview};}
test("preview compares the full saved account journal through a GET and never writes or downloads",async()=>{
  const{scope,preview}=await setup();let requests=0;privateExportClient.defaults.adapter=async c=>{requests++;assert.equal(c.method,"get");assert.equal(c.data,undefined);return reply(c,text(53))};
  try{preview.select(file(text(2101)));assert.equal(await preview.run(),true);assert.equal(preview.preview.value?.counts[1].inDestination,53);assert.equal(preview.preview.value?.counts[1].add,2048);assert.equal(storageWrites,0);assert.equal(requests,1);assert.equal(preview.preview.value?.destinationVersion,9);}finally{scope.stop();}
});
test("device comparison reads original stored data and failed destination reads never become empty comparisons",async()=>{
  const{scope,preview}=await setup();storage.set("gamevault_workspace_v1",JSON.stringify(blankWorkspace()));const original=storage.get("gamevault_workspace_v1");
  try{preview.destination.value="device";preview.select(file());assert.equal(await preview.run(),true);assert.equal(preview.preview.value?.destination,"device");assert.equal(storage.get("gamevault_workspace_v1"),original);assert.equal(storageWrites,0);preview.destination.value="account";privateExportClient.defaults.adapter=async()=>{throw new Error("unavailable")};assert.equal(await preview.run(),false);assert.equal(preview.preview.value,null);assert.equal(preview.fileInvalid.value,false);assert.match(preview.error.value,/destination data/);}finally{scope.stop();}
});
test("invalid size and encoding stop before destination access and allow correction",async()=>{
  const{scope,preview}=await setup();let reads=0,requests=0;privateExportClient.defaults.adapter=async c=>{requests++;return reply(c,text())};
  try{preview.select({name:"large.json",size:32*1024*1024+1,arrayBuffer:async()=>{reads++;return new ArrayBuffer(0)}});assert.equal(await preview.run(),false);assert.equal(reads,0);const invalid=new Uint8Array([0xc3,0x28]);preview.select({name:"invalid.json",size:2,arrayBuffer:async()=>invalid.buffer});assert.equal(await preview.run(),false);assert.equal(preview.fileInvalid.value,true);assert.match(preview.error.value,/UTF-8/);assert.equal(requests,0);preview.select(file());assert.equal(await preview.run(),true);assert.equal(preview.fileInvalid.value,false);assert.equal(requests,1);}finally{scope.stop();}
});
test("clear, logout, destination/file changes and disposal cancel delayed file reads before account requests",async()=>{
  for(const change of["clear","logout","destination","file","dispose"]){const{auth,scope,preview}=await setup(),read=gate<ArrayBuffer>();let requests=0;privateExportClient.defaults.adapter=async c=>{requests++;return reply(c,text())};const chosen=file();preview.select({...chosen,arrayBuffer:()=>read.wait});const pending=preview.run();await flush();if(change==="clear")preview.clear();else if(change==="logout")auth.logout();else if(change==="destination")preview.destination.value="device";else if(change==="file")preview.select(file(text(2)));else scope.stop();read.release(await chosen.arrayBuffer());assert.equal(await pending,false);assert.equal(requests,0);assert.equal(preview.preview.value,null);scope.stop();}
});
test("obsolete destination failures cannot overwrite a newer same-token preview",async()=>{
  const{auth,scope,preview}=await setup(),old=gate<string>(),fresh=gate<string>();let calls=0;privateExportClient.defaults.adapter=async c=>reply(c,await(calls++===0?old.wait:fresh.wait));
  try{preview.select(file());const first=preview.run();await flush();assert.equal(await preview.run(),false);auth.logout();auth.token="alice";auth.user={id:"alice",email:"alice@example.invalid",role:"USER"};preview.select(file(text(2)));const second=preview.run();await flush();old.reject(new Error("Old failure"));await first;assert.equal(preview.busy.value,true);assert.equal(preview.error.value,"");fresh.release(text());assert.equal(await second,true);assert.equal(preview.preview.value?.counts[1].inFile,2);assert.equal(calls,2);assert.equal(storageWrites,0);}finally{old.release(text());fresh.release(text());scope.stop();}
});


test("saved store changes discard completed and pending comparisons without clearing the selected file",async()=>{
  const{scope,preview}=await setup();const late=gate<string>();let requests=0;
  privateExportClient.defaults.adapter=async c=>reply(c,++requests===1?text():await late.wait);
  try{
    const chosen=file();preview.select(chosen);assert.equal(await preview.run(),true);
    useWorkspaceStore().data.profile.bio="Saved elsewhere";
    assert.equal(preview.preview.value,null);assert.equal(preview.file.value,chosen);assert.match(preview.error.value,/may have changed/);
    const pending=preview.run();await flush();useLibraryStore().entries=[];
    assert.equal(preview.busy.value,false);late.release(text());assert.equal(await pending,false);assert.equal(preview.preview.value,null);
    assert.match(preview.error.value,/may have changed/);assert.equal(storageWrites,0);
  }finally{late.release(text());scope.stop();}
});

test("cross-tab device changes and returning focus invalidate previews and listeners are removed on disposal",async()=>{
  const events=new EventTarget();
  Object.defineProperty(globalThis,"window",{configurable:true,value:events});
  const{scope,preview}=await setup();privateExportClient.defaults.adapter=async c=>reply(c,text());
  const emit=(key:string|null)=>{const event=new Event("storage");Object.defineProperty(event,"key",{value:key});events.dispatchEvent(event)};
  try{
    preview.destination.value="device";preview.select(file());assert.equal(await preview.run(),true);
    emit("unrelated");assert.ok(preview.preview.value);emit("gamevault_workspace_v1");assert.equal(preview.preview.value,null);
    assert.equal(await preview.run(),true);emit(null);assert.equal(preview.preview.value,null);
    preview.destination.value="account";assert.equal(await preview.run(),true);emit("gamevault_library_v1");assert.ok(preview.preview.value);
    events.dispatchEvent(new Event("focus"));assert.equal(preview.preview.value,null);assert.match(preview.error.value,/may have changed/);
    scope.stop();events.dispatchEvent(new Event("focus"));assert.equal(preview.error.value,"");assert.equal(storageWrites,0);
  }finally{scope.stop();Reflect.deleteProperty(globalThis,"window");}
});
