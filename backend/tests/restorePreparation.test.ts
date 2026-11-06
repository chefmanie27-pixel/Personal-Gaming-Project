import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { issueToken } from "../src/auth.js";
import { snapshot } from "../src/library.js";
import { workspaceSchema } from "../src/workspace.js";
import { PrivateExportBuilder } from "../src/privateExport.js";
import { prepareRestore,verifyRestorePlan,validateRestoreDocument,RestorePreparationError,createRestorePreparationRouter } from "../src/restorePreparation.js";
const secret="restore-test-secret-is-not-production-0123456789", now=Date.parse("2026-11-06T12:00:00Z");
const game=snapshot.parse({id:"steam-1",slug:"steam-1",title:"Private fixture",store:"Steam"});
function doc(count=1){const out=new PrivateExportBuilder(workspaceSchema.parse({}),"normalized",3);out.library({game,status:"Completed",favorite:true,rating:8,hours:20,notes:"Private library note",addedAt:"2026-01-01T00:00:00.000Z"});for(let n=0;n<count;n++)out.journal({id:"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),game,date:"2026-11-06",kind:"session",minutes:1,notes:"Private journal note",progress:"",tags:[],spoiler:false,rating:null});return JSON.parse(out.finish());}

test("prepare compares complete journals, keeps destination conflicts, preserves inputs and returns no write payload",()=>{
 const source=doc(2101),destination=doc(53);source.data.library.push({...source.data.library[0],game:{...game,id:"steam-2",slug:"steam-2"}});const original=JSON.stringify([source,destination]);
 const plan=prepareRestore("alice",source,destination,secret,now);assert.equal(plan.counts.length,8);assert.deepEqual(plan.counts[1],{label:"Journal entries",inFile:2101,inDestination:53,add:2048,keep:53});assert.equal(plan.counts[0].add,1);assert.equal(plan.counts[0].keep,1);assert.equal(plan.applyAvailable,false);assert.equal(JSON.stringify([source,destination]),original);assert.doesNotMatch(JSON.stringify(plan),/Private journal note|Private library note|password/);assert.equal(verifyRestorePlan(plan.planToken,"alice",source,destination,secret,now),true);
});

test("signed plans bind user, source, every destination dataset and expiry but ignore export timestamp/key/row order",()=>{
 const source=doc(3),destination=doc(2),plan=prepareRestore("alice",source,destination,secret,now);
 assert.equal(verifyRestorePlan(plan.planToken,"bob",source,destination,secret,now),false);assert.equal(verifyRestorePlan(plan.planToken,"alice",source,destination,secret,now+600000),false);assert.equal(verifyRestorePlan(plan.planToken,"alice",source,destination,"wrong secret",now),false);
 for(const token of [plan.planToken+"x",plan.planToken.split(".")[0]+"."+"?".repeat(43),"",plan.planToken+".extra"])assert.equal(verifyRestorePlan(token,"alice",source,destination,secret,now),false);
 const reordered=structuredClone(destination);reordered.exportedAt="2027-01-01T00:00:00.000Z";reordered.data.journal.reverse();reordered.data.workspace.profile={bio:"",name:""};assert.equal(verifyRestorePlan(plan.planToken,"alice",source,reordered,secret,now+1),true);
 for(const change of [(d:any)=>d.data.library[0].notes="Changed",(d:any)=>d.data.journal[0].notes="Changed",(d:any)=>d.data.workspace.profile.bio="Changed",(d:any)=>d.consistency.workspaceVersion++]){const changed=structuredClone(destination);change(changed);assert.equal(verifyRestorePlan(plan.planToken,"alice",source,changed,secret,now),false);}
 const changed=structuredClone(source);changed.data.library[0].hours++;assert.equal(verifyRestorePlan(plan.planToken,"alice",changed,destination,secret,now),false);
});

test("validation refuses legacy identifiers, trimming, unknown fields, ambiguous case, duplicate IDs and broken references",()=>{
 for(const change of [(d:any)=>d.formatVersion=2,(d:any)=>d.data.journal[0].id="legacy",(d:any)=>d.data.journal[0].notes=" trailing ",(d:any)=>d.data.library[0].game.secret="silently stripped",(d:any)=>d.data.library[0].game.cover="http://example.invalid/image",(d:any)=>d.data.journal.push(d.data.journal[0]),(d:any)=>d.data.workspace.journal=[],(d:any)=>d.data.workspace.metadata["steam-1"]={collectionIds:["00000000-0000-4000-8000-000000000099"]}]){const source=doc();change(source);assert.throws(()=>prepareRestore("alice",source,doc(),secret,now),RestorePreparationError);}
 const source=doc();source.data.library[0].game.slug="steam-A";const destination=doc();destination.data.library[0].game.slug="steam-a";assert.throws(()=>prepareRestore("alice",source,destination,secret,now),/case/);
 const legacy=doc();legacy.source.journalMode="legacy";assert.throws(()=>prepareRestore("alice",doc(),legacy,secret,now),/normalized/);
 const device=doc();device.source={kind:"device",journalMode:"legacy"};device.consistency={kind:"device-read",workspaceVersion:null};assert.equal(prepareRestore("alice",device,doc(),secret,now).applyAvailable,false);
 assert.throws(()=>validateRestoreDocument(JSON.parse('{"__proto__":{}}')),RestorePreparationError);
 const complex=doc();let node:any=complex;for(let i=0;i<42;i++){node.extra={};node=node.extra;}assert.throws(()=>validateRestoreDocument(complex),RestorePreparationError);
});

test("combined workspace capacity is checked without truncating either source",()=>{
 const source=doc(),destination=doc();const collections=(prefix:number)=>Array.from({length:60},(_,n)=>({id:"00000000-0000-4000-8000-"+String(prefix+n).padStart(12,"0"),name:"Collection"}));source.data.workspace.collections=collections(0);destination.data.workspace.collections=collections(100);assert.throws(()=>prepareRestore("alice",source,destination,secret,now),/combined workspace/);
});

test("API authenticates before parsing, requires consent, derives owner, returns no-store and never exposes repository errors",async()=>{
 const users:string[]=[];let failure:Error|undefined, saved=JSON.stringify(doc(53));const app=express();app.use("/restore",createRestorePreparationRouter({async read(id){users.push(id);if(failure)throw failure;return saved;}},secret));const server=app.listen(0);await new Promise<void>(r=>server.once("listening",r));const address=server.address();assert.ok(address&&typeof address!=="string");const url="http://127.0.0.1:"+address.port+"/restore";
 const payload=()=>({destination:"account",policy:"destination-wins-v1",uploadConsent:true,backup:doc(54)});
 const post=(value:unknown,user="alice",query="")=>fetch(url+"/prepare"+query,{method:"POST",headers:{"Content-Type":"application/json",...(user?{Authorization:"Bearer "+issueToken({id:user,role:"USER"})}:{})},body:typeof value==="string"?value:JSON.stringify(value)});
 try{
 assert.equal((await post("invalid json","")).status,401);assert.deepEqual(users,[]);
 const missing=payload() as any;delete missing.backup;assert.equal((await post(missing)).status,400);assert.equal((await post({...payload(),backup:null})).status,400);
 assert.equal((await post({...payload(),uploadConsent:false})).status,400);assert.equal((await post({...payload(),userId:"bob"})).status,400);assert.equal((await post(payload(),"alice","?userId=bob")).status,400);assert.equal((await post("{bad-json")).status,400);assert.deepEqual(users,[]);
 const invalid=payload();invalid.backup.formatVersion=99;assert.equal((await post(invalid)).status,400);assert.deepEqual(users,[]);
 const oversized=await post(" ".repeat(32*1024*1024)+"{}");assert.equal(oversized.status,413);assert.equal(oversized.headers.get("cache-control"),"no-store");assert.deepEqual(users,[]);
 const invalidUTF8=await fetch(url+"/prepare",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+issueToken({id:"alice",role:"USER"})},body:new Uint8Array([0x7b,0x22,0xc3,0x28,0x22,0x3a,0x31,0x7d])});assert.equal(invalidUTF8.status,400);assert.deepEqual(users,[]);
 const response=await post(payload());assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");const plan=await response.json();assert.equal(plan.counts[1].add,1);assert.equal(plan.applyAvailable,false);assert.deepEqual(users,["alice"]);
 const bob=await post(payload(),"bob");assert.equal(bob.status,200);assert.deepEqual(users,["alice","bob"]);
 failure=new Error("DB password private");const failed=await post(payload());assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/password/);failure=undefined;saved="invalid";assert.equal((await post(payload())).status,503);
 assert.equal((await fetch(url+"/apply",{method:"POST",headers:{Authorization:"Bearer "+issueToken({id:"alice",role:"USER"})}})).status,404);
 }finally{await new Promise<void>((r,e)=>server.close(error=>error?e(error):r()));}
});
