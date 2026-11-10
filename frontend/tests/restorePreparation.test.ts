import {test} from "node:test";
import assert from "node:assert/strict";
import {createPinia,setActivePinia} from "pinia";
import {effectScope,ref,shallowRef} from "vue";
import {useAuthStore} from "../src/stores/auth";
import {blankWorkspace,useWorkspaceStore} from "../src/stores/workspace";
import {privateExportClient} from "../src/services/privateExport";
import {RESTORE_PLAN_LABELS,validateRestorePlan,RestorePreparationError,requestRestorePreparation} from "../src/services/restorePreparation";
import {useRestorePreparation} from "../src/composables/useRestorePreparation";
import type {useRestorePreview} from "../src/composables/useRestorePreview";
let writes=0;Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>null,setItem:()=>writes++,removeItem:()=>writes++}});
function backup(){const{journal:_,...workspace}=blankWorkspace();workspace.profile.bio="PRIVATE ORIGINAL";return{format:"gamevault-private-data",formatVersion:1,exportedAt:"2026-11-10T10:00:00.000Z",source:{kind:"device",journalMode:"legacy"},consistency:{kind:"device-read",workspaceVersion:null},data:{library:[],workspace,journal:[]}};}
function file(){const bytes=new TextEncoder().encode(JSON.stringify(backup()));return{name:"private.json",size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer};}
function plan(ms=600000){return{planToken:"opaque."+"a".repeat(43),expiresAt:new Date(Date.now()+ms).toISOString(),policy:"destination-wins-v1",applyAvailable:false,counts:RESTORE_PLAN_LABELS.map(label=>({label,inFile:1,inDestination:2,add:0,keep:1}))};}
const reply=(config:any,data:any)=>({config,data,status:200,statusText:"OK",headers:{}});
function gate<T>(){let release!:(value:T)=>void,reject!:(reason:Error)=>void;const wait=new Promise<T>((a,b)=>{release=a;reject=b});return{wait,release,reject};}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(){writes=0;setActivePinia(createPinia());const auth=useAuthStore();auth.token="alice";auth.user={id:"alice",email:"alice@example.invalid",role:"USER"};useWorkspaceStore().sessionKey="alice";const context={destination:ref("account"),file:shallowRef(file()),preview:shallowRef({}),busy:ref(false),blockedReason:ref("")} as unknown as ReturnType<typeof useRestorePreview>;const scope=effectScope();const preparation=scope.run(()=>useRestorePreparation(context))!;return{scope,context,preparation,auth};}

test("preparation sends only an explicitly consented account request, preserves source fields and guards duplicate starts",async()=>{
 const{scope,context,preparation:p}=setup(),pending=gate<any>();let calls=0;privateExportClient.defaults.adapter=async config=>{calls++;assert.equal(config.method,"post");assert.equal(config.url,"/private-restore/prepare");assert.equal(config.headers.Authorization,"Bearer alice");assert.deepEqual(JSON.parse(config.data),{destination:"account",policy:"destination-wins-v1",uploadConsent:true,backup:backup()});return reply(config,await pending.wait)};
 try{assert.equal(await p.prepare(),false);assert.equal(calls,0);p.consent.value=true;context.destination.value="device";assert.equal(p.consent.value,false);assert.equal(await p.prepare(),false);context.destination.value="account";p.consent.value=true;const first=p.prepare();await flush();assert.equal(await p.prepare(),false);assert.equal(calls,1);pending.release(plan());assert.equal(await first,true);assert.equal(p.plan.value?.counts.length,8);assert.equal(p.reviewed.value,false);p.reviewed.value=true;assert.equal(writes,0);p.consent.value=false;assert.equal(p.plan.value,null);assert.equal(p.reviewed.value,false);}finally{pending.release(plan());scope.stop();}
});

test("file, preview, consent, account and disposal changes prevent late local reads from uploading",async()=>{
 for(const change of ["file","preview","consent","account","dispose"]){const{scope,context,preparation:p,auth}=setup(),pending=gate<ArrayBuffer>(),original=file();let calls=0;privateExportClient.defaults.adapter=async config=>{calls++;return reply(config,plan())};context.file.value={...original,arrayBuffer:()=>pending.wait};p.consent.value=true;const work=p.prepare();await flush();if(change==="file")context.file.value=file();else if(change==="preview")context.preview.value=null;else if(change==="consent")p.consent.value=false;else if(change==="account")auth.logout();else scope.stop();pending.release(await original.arrayBuffer());assert.equal(await work,false);assert.equal(calls,0);assert.equal(p.plan.value,null);scope.stop();}
});

test("obsolete requests cannot publish a plan or clear a newer same-token pending request",async()=>{
 const{scope,context,preparation:p,auth}=setup(),old=gate<any>(),fresh=gate<any>();let calls=0;privateExportClient.defaults.adapter=async config=>reply(config,await(++calls===1?old.wait:fresh.wait));
 try{p.consent.value=true;const first=p.prepare();await flush();auth.user={id:"bob",email:"bob@example.invalid",role:"USER"};auth.user={id:"alice",email:"alice@example.invalid",role:"USER"};context.preview.value={} as any;p.consent.value=true;const second=p.prepare();await flush();old.reject(new Error("private obsolete failure"));assert.equal(await first,false);assert.equal(p.busy.value,true);assert.equal(p.error.value,"");fresh.release(plan());assert.equal(await second,true);assert.ok(p.plan.value);context.blockedReason.value="Pending save";assert.equal(p.plan.value,null);assert.equal(p.consent.value,false);assert.equal(p.reviewed.value,false);}finally{old.release(plan());fresh.release(plan());scope.stop();}
});

test("expiry clears review and consent and requires a new preparation without a write",async()=>{
 const{scope,preparation:p}=setup();privateExportClient.defaults.adapter=async config=>reply(config,plan(80));
 try{p.consent.value=true;assert.equal(await p.prepare(),true);p.reviewed.value=true;await new Promise(r=>setTimeout(r,130));assert.equal(p.plan.value,null);assert.equal(p.reviewed.value,false);assert.equal(p.consent.value,false);assert.match(p.error.value,/expired/);assert.equal(await p.prepare(),false);assert.equal(writes,0);}finally{scope.stop();}
});

test("invalid or expired server responses fail closed and never publish private error details",async()=>{
 const valid=plan(),now=Date.now();for(const change of [(v:any)=>v.applyAvailable="invalid",(v:any)=>v.expiresAt=new Date(now-1).toISOString(),(v:any)=>v.expiresAt=new Date(now+900000).toISOString(),(v:any)=>v.counts.pop(),(v:any)=>v.counts[0].add=5,(v:any)=>v.counts[0].label="Private injected heading",(v:any)=>v.planToken="invalid"]){const changed=structuredClone(valid);change(changed);assert.throws(()=>validateRestorePlan(changed,now),RestorePreparationError);}
 const{scope,preparation:p}=setup();privateExportClient.defaults.adapter=async config=>reply(config,{...plan(),applyAvailable:"invalid"});try{p.consent.value=true;assert.equal(await p.prepare(),false);assert.equal(p.plan.value,null);assert.match(p.error.value,/invalid or expired/);privateExportClient.defaults.adapter=async()=>{throw new Error("PRIVATE ORIGINAL password")};assert.equal(await p.prepare(),false);assert.doesNotMatch(p.error.value,/PRIVATE|password/);}finally{scope.stop();}
});

test("upload envelope size is checked before network access",async()=>{let calls=0;privateExportClient.defaults.adapter=async config=>{calls++;return reply(config,plan())};await assert.rejects(requestRestorePreparation("alice",{notes:"x".repeat(32*1024*1024)}),/envelope exceed/);assert.equal(calls,0);});
