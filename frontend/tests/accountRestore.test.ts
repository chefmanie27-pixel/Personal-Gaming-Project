import {test} from "node:test";
import assert from "node:assert/strict";
import {createPinia,setActivePinia} from "pinia";
import {effectScope,ref,shallowRef} from "vue";
import {useAuthStore} from "../src/stores/auth";
import {useLibraryStore} from "../src/stores/library";
import {libraryClient} from "../src/services/library";
import {blankWorkspace,useWorkspaceStore,workspaceClient} from "../src/stores/workspace";
import {journalClient} from "../src/stores/journal";
import {privateExportClient} from "../src/services/privateExport";
import {RESTORE_PLAN_LABELS,RestorePreparationError} from "../src/services/restorePreparation";
import {useRestorePreparation} from "../src/composables/useRestorePreparation";
import {useAccountRestore} from "../src/composables/useAccountRestore";
import type {useRestorePreview} from "../src/composables/useRestorePreview";
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}});
const reply=(config:any,data:any)=>({config,data,status:200,statusText:"OK",headers:{}});
function gate<T>(){let release!:(value:T)=>void,reject!:(reason:Error)=>void;const wait=new Promise<T>((a,b)=>{release=a;reject=b});return{wait,release,reject};}
const flush=()=>new Promise(r=>setTimeout(r,0));
function backup(){const{journal:_,...workspace}=blankWorkspace();return{format:"gamevault-private-data",formatVersion:1,exportedAt:"2026-11-10T00:00:00.000Z",source:{kind:"device",journalMode:"legacy"},consistency:{kind:"device-read",workspaceVersion:null},data:{library:[],workspace,journal:[]}};}
const plan=()=>({planToken:"opaque."+"a".repeat(43),expiresAt:new Date(Date.now()+600000).toISOString(),policy:"destination-wins-v1",applyAvailable:true,counts:RESTORE_PLAN_LABELS.map(label=>({label,inFile:1,inDestination:0,add:1,keep:0}))});
async function setup(){setActivePinia(createPinia());const auth=useAuthStore();auth.token="alice";auth.user={id:"alice",email:"alice@example.invalid",role:"USER"};libraryClient.defaults.adapter=async c=>reply(c,{data:[]});workspaceClient.defaults.adapter=async c=>reply(c,{data:blankWorkspace(),version:0,journalMode:"normalized"});journalClient.defaults.adapter=async c=>reply(c,{data:[],meta:{hasMore:false,nextCursor:null}});await useLibraryStore().connect("alice","alice");await useWorkspaceStore().connect("alice","alice");const bytes=new TextEncoder().encode(JSON.stringify(backup())),file={name:"private.json",size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer};const context={destination:ref("account"),file:shallowRef(file),preview:shallowRef({}),busy:ref(false),blockedReason:ref("")} as unknown as ReturnType<typeof useRestorePreview>;const scope=effectScope();const dirty=ref(false);const preparation=scope.run(()=>useRestorePreparation(context))!;const application=scope.run(()=>useAccountRestore(context,preparation,()=>dirty.value))!;preparation.consent.value=true;privateExportClient.defaults.adapter=async c=>reply(c,plan());assert.equal(await preparation.prepare(),true);return{scope,auth,context,preparation,application,dirty};}
const result={restored:true,libraryAdded:2,journalAdded:3,workspaceVersion:1};
test("account apply requires review and exact destination confirmation, suppresses duplicates and reloads saved state",async()=>{
 const{scope,preparation:p,application:a,dirty}=await setup(),held=gate<any>();let calls=0;privateExportClient.defaults.adapter=async c=>{calls++;assert.equal(c.url,"/private-restore/apply");const payload=JSON.parse(c.data);assert.equal(payload.confirmApply,true);assert.equal(payload.destination,"account");assert.deepEqual(payload.backup,backup());return reply(c,await held.wait);};
 try{assert.equal(await a.apply(),false);p.reviewed.value=true;a.confirmation.value="wrong@example.invalid";assert.equal(await a.apply(),false);a.confirmation.value="alice@example.invalid";dirty.value=true;assert.equal(await a.apply(),false);dirty.value=false;const work=a.apply();await flush();assert.equal(await a.apply(),false);assert.equal(calls,1);held.release(result);assert.equal(await work,true);assert.equal(a.needsReload.value,false);assert.match(a.message.value,/Restore committed: 2.*3/);assert.equal(p.plan.value,null);assert.equal(p.consent.value,false);}finally{held.release(result);scope.stop();}
});
test("a lost response requires authoritative reload before another plan can apply",async()=>{
 const{scope,preparation:p,application:a}=await setup();privateExportClient.defaults.adapter=async()=>{throw new Error("Disconnected after commit")};try{p.reviewed.value=true;a.confirmation.value="alice@example.invalid";assert.equal(await a.apply(),false);assert.equal(a.needsReload.value,true);assert.match(a.error.value,/completion is uncertain/);assert.equal(p.plan.value,null);assert.equal(await a.apply(),false);assert.equal(await a.reload(),true);assert.equal(a.needsReload.value,false);assert.match(a.message.value,/reloaded/);}finally{scope.stop();}
});
test("known commit with failed refresh stays committed and offers reload without repeating apply",async()=>{
 const{scope,preparation:p,application:a}=await setup();let writes=0;privateExportClient.defaults.adapter=async c=>{writes++;return reply(c,result);};workspaceClient.defaults.adapter=async()=>{throw new Error("refresh unavailable")};try{p.reviewed.value=true;a.confirmation.value="alice@example.invalid";await a.apply();assert.equal(writes,1);assert.equal(a.needsReload.value,true);assert.match(a.message.value,/Restore committed/);assert.match(a.error.value,/committed/);workspaceClient.defaults.adapter=async c=>reply(c,{data:blankWorkspace(),version:1,journalMode:"normalized"});assert.equal(await a.reload(),true);assert.equal(writes,1);}finally{scope.stop();}
});
test("logout, changed file and disposal discard a late local read before apply requests",async()=>{
 for(const change of ["logout","file","dispose"]){const{scope,auth,context,preparation:p,application:a}=await setup(),held=gate<ArrayBuffer>(),chosen=context.file.value!;context.file.value={...chosen,arrayBuffer:()=>held.wait};privateExportClient.defaults.adapter=async c=>reply(c,plan());p.consent.value=true;const prep=p.prepare();held.release(await chosen.arrayBuffer());await prep;p.reviewed.value=true;a.confirmation.value="alice@example.invalid";const next=gate<ArrayBuffer>();context.file.value!.arrayBuffer=()=>next.wait;let calls=0;privateExportClient.defaults.adapter=async c=>{calls++;return reply(c,result)};const work=a.apply();await flush();if(change==="logout")auth.logout();else if(change==="file")context.file.value={...chosen};else scope.stop();next.release(await chosen.arrayBuffer());assert.equal(await work,false);assert.equal(calls,0);assert.equal(a.message.value,"");scope.stop();}
});
test("old accepted responses cannot refresh or publish status in a newer account",async()=>{
 const{scope,auth,preparation:p,application:a}=await setup(),held=gate<any>();let refreshes=0;privateExportClient.defaults.adapter=async c=>reply(c,await held.wait);libraryClient.defaults.adapter=async c=>{refreshes++;return reply(c,{data:[]});};try{p.reviewed.value=true;a.confirmation.value="alice@example.invalid";const work=a.apply();await flush();auth.user={id:"bob",email:"bob@example.invalid",role:"USER"};held.release(result);assert.equal(await work,false);assert.equal(refreshes,0);assert.equal(a.message.value,"");assert.equal(a.applying.value,false);}finally{held.release(result);scope.stop();}
});

test("a local apply-envelope rejection does not claim an uncertain server commit",async()=>{const{scope,preparation:p,application:a}=await setup();privateExportClient.defaults.adapter=async()=>{throw new RestorePreparationError("Local envelope exceeds limit")};try{p.reviewed.value=true;a.confirmation.value="alice@example.invalid";assert.equal(await a.apply(),false);assert.equal(a.needsReload.value,false);assert.match(a.error.value,/no restore request was sent/);}finally{scope.stop();}});
