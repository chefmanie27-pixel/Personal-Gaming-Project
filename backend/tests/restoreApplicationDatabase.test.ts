import "dotenv/config";
import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type {PrismaClient,Prisma} from "@prisma/client";
import {workspaceSchema,journalItemSchema} from "../src/workspace.js";
import {snapshot} from "../src/library.js";
import {PrivateExportBuilder} from "../src/privateExport.js";
import {prepareRestore} from "../src/restorePreparation.js";
import {applyAccountRestore} from "../src/restoreApplicationRepository.js";
import {readPrivateExport} from "../src/privateExportRepository.js";
const secret="disposable-atomic-restore-test-secret-only";
function gate(){let release!:()=>void;const wait=new Promise<void>(r=>release=r);return{wait,release};}
test("MySQL restore is atomic, preserves conflicts, restores full history and rejects stale/replayed plans",{skip:process.env.GAMEVAULT_DATABASE_TESTS!=="1"},async()=>{
 const{prisma}=await import("../src/db.js");const users:string[]=[];
 const game=snapshot.parse({id:"steam-1",slug:"steam-1",title:"Fixture",store:"Steam"});
 const entry=(id=randomUUID())=>journalItemSchema.parse({id,game,date:"2026-11-10",kind:"session",minutes:5,notes:"Source private",progress:"",tags:[],spoiler:false,rating:null});
 const source=(count=1)=>{const out=new PrivateExportBuilder(workspaceSchema.parse({profile:{name:"Source profile",bio:"Private"},collections:[{id:"00000000-0000-4000-8000-000000000001",name:"Restored"}]}),"normalized",999);out.library({game,status:"Completed",favorite:true,rating:8,hours:20,notes:"Source note",addedAt:"2026-01-01T00:00:00.000Z"});for(let n=0;n<count;n++)out.journal({...entry(),version:77});return JSON.parse(out.finish());};
 const state=async(user:string)=>{const doc=JSON.parse(await readPrivateExport(prisma,user));doc.exportedAt="2026-11-10T00:00:00.000Z";return doc;};
 const prepare=async(user:string,backup:any)=>prepareRestore(user,backup,await state(user),secret).planToken;
 try{
 for(let n=0;n<5;n++){const user=await prisma.user.create({data:{email:"restore-"+randomUUID()+"@example.invalid",passwordHash:"disabled"}});users.push(user.id);await prisma.userWorkspace.create({data:{userId:user.id,journalMigrated:true,data:workspaceSchema.parse({profile:{name:"Destination",bio:"Kept"}}) as Prisma.InputJsonValue}});}
 const[alice,bob,rollback,stale,concurrent]=users;
 const backup=source(2101);await prisma.libraryEntry.create({data:{userId:alice,slug:game.slug,game:game as Prisma.InputJsonValue,notes:"Destination note",hours:7}});
 const before=await state(bob),token=await prepare(alice,backup);
 assert.equal((await applyAccountRestore(prisma,alice,backup,token,secret)).journalAdded,2101);
 const after=await state(alice);assert.equal(after.data.library[0].notes,"Destination note");assert.equal(after.data.library[0].hours,7);assert.equal(after.data.workspace.profile.name,"Destination");assert.equal(after.data.workspace.collections.length,1);assert.equal(after.data.journal.length,2101);assert.ok(after.data.journal.every((row:any)=>row.version===0));assert.deepEqual(await state(bob),before);
 await assert.rejects(applyAccountRestore(prisma,alice,backup,token,secret),/changed|expired/);
 await assert.rejects(applyAccountRestore(prisma,bob,backup,token,secret),/changed|expired/);
 const retry=await applyAccountRestore(prisma,alice,backup,await prepare(alice,backup),secret);assert.equal(retry.libraryAdded,0);assert.equal(retry.journalAdded,0);
 // Inject a failure after both library and journal INSERTs have executed, before metadata commit.
 const rollbackSource=source(2),rollbackBefore=await state(rollback),rollbackToken=await prepare(rollback,rollbackSource);
 const failing=new Proxy(prisma,{get(target,key){if(key!=="$transaction")return Reflect.get(target,key);return(callback:any,options:any)=>target.$transaction(tx=>callback(new Proxy(tx,{get(transaction,delegate){if(delegate!=="userWorkspace")return Reflect.get(transaction,delegate);return new Proxy(transaction.userWorkspace,{get(model,method){if(method!=="updateMany")return Reflect.get(model,method);return async()=>{throw new Error("Injected after library and journal writes");};}});}})),options);}}) as PrismaClient;
 await assert.rejects(applyAccountRestore(failing,rollback,rollbackSource,rollbackToken,secret),/Injected/);assert.deepEqual(await state(rollback),rollbackBefore);
 // Independently changing each dataset after preparation must reject the old plan without inserts.
 for(const dataset of ["workspace","library","journal"]){const incoming=source(),oldPlan=await prepare(stale,incoming);
 if(dataset==="workspace")await prisma.userWorkspace.update({where:{userId:stale},data:{version:{increment:1}}});
 else if(dataset==="library")await prisma.libraryEntry.create({data:{userId:stale,slug:"steam-stale",game:{...game,id:"steam-stale",slug:"steam-stale"},notes:"Changed"}});
 else {const row=entry();await prisma.journalRecord.create({data:{userId:stale,id:row.id,slug:game.slug,title:game.title,game:game as Prisma.InputJsonValue,entryDate:new Date("2026-11-10T00:00:00Z"),kind:"session",minutes:5,notes:"Changed",progress:"",tags:[],spoiler:false,searchText:"Changed"}});}
 const changed=await state(stale);await assert.rejects(applyAccountRestore(prisma,stale,incoming,oldPlan,secret),/changed|expired/);assert.deepEqual(await state(stale),changed);}
 // Real MySQL collation treats differently-cased slugs as the same key; preflight must reject it.
 await prisma.libraryEntry.create({data:{userId:bob,slug:"steam-ABC",game:{...game,id:"steam-ABC",slug:"steam-ABC"},notes:"Case destination"}});const ambiguous=source();ambiguous.data.library[0].game.slug="steam-abc";assert.equal(await prisma.libraryEntry.count({where:{userId:bob,slug:"steam-abc"}}),1);await assert.rejects(prepare(bob,ambiguous),/case/);
 // Exercise overlapping writers in every persisted dataset while the restore transaction is open.
 for(const dataset of ["library","journal","workspace"]){
 const reached=gate(),resume=gate(),incoming=source(),newSlug="steam-restore-"+dataset;
 incoming.data.library[0].game={...game,id:newSlug,slug:newSlug};
 const beforeConcurrent=await state(concurrent),concurrentToken=await prepare(concurrent,incoming);
 const held=new Proxy(prisma,{get(target,key){if(key!=="$transaction")return Reflect.get(target,key);return(callback:any,options:any)=>target.$transaction(tx=>callback(new Proxy(tx,{get(transaction,delegate){if(delegate!=="libraryEntry")return Reflect.get(transaction,delegate);return new Proxy(transaction.libraryEntry,{get(model,method){if(method!=="findMany")return Reflect.get(model,method);return async(args:any)=>{const rows=await model.findMany(args);reached.release();await resume.wait;return rows;};}});}})),options);}}) as PrismaClient;
 const restoring=applyAccountRestore(held,concurrent,incoming,concurrentToken,secret);await reached.wait;
 const writerId=randomUUID();
 const writing=dataset==="library"?prisma.libraryEntry.create({data:{userId:concurrent,slug:"steam-concurrent",game:{...game,id:"steam-concurrent",slug:"steam-concurrent"},notes:"Concurrent write"}}):dataset==="workspace"?prisma.userWorkspace.update({where:{userId:concurrent},data:{version:{increment:1}}}):prisma.journalRecord.create({data:{userId:concurrent,id:writerId,slug:game.slug,title:game.title,game:game as Prisma.InputJsonValue,entryDate:new Date("2026-11-10T00:00:00Z"),kind:"session",minutes:9,notes:"Concurrent journal",progress:"",tags:[],spoiler:false,searchText:"Concurrent journal"}});
 const outcomes=Promise.allSettled([restoring,writing]);resume.release();const results=await outcomes;
 const final=await state(concurrent),restored=results[0].status==="fulfilled",written=results[1].status==="fulfilled";
 assert.ok(restored||written,"at least one concurrent transaction must complete");
 assert.equal(final.data.library.some((row:any)=>row.game.slug===newSlug),restored);
 assert.equal(final.data.journal.some((row:any)=>row.id===incoming.data.journal[0].id),restored);
 if(dataset==="journal")assert.equal(final.data.journal.some((row:any)=>row.id===writerId),written);
 assert.equal(final.data.journal.length,beforeConcurrent.data.journal.length+Number(restored)+Number(dataset==="journal"&&written));
 if(dataset==="library")assert.equal(final.data.library.some((row:any)=>row.game.slug==="steam-concurrent"),written);
 }
 const legacy=await prisma.user.create({data:{email:"restore-legacy-"+randomUUID()+"@example.invalid",passwordHash:"disabled"}});users.push(legacy.id);await assert.rejects(prepare(legacy.id,source()),/normalized/);assert.equal(await prisma.userWorkspace.count({where:{userId:legacy.id}}),0);
 }finally{await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.$disconnect();}
});
