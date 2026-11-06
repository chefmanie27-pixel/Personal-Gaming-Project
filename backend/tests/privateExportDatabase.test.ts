import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prepareRestore, verifyRestorePlan } from "../src/restorePreparation.js";
import type { PrismaClient, Prisma } from "@prisma/client";
import { workspaceSchema, journalItemSchema } from "../src/workspace.js";
test("MySQL private export is read-only, complete beyond 2000 rows, isolated and transactionally consistent", { skip: process.env.GAMEVAULT_DATABASE_TESTS!=="1" }, async () => {
  const {prisma}=await import("../src/db.js"), {readPrivateExport}=await import("../src/privateExportRepository.js"); const users:string[]=[];
  const game={id:"steam-123",slug:"steam-123",title:"Fixture",store:"Steam",genres:["RPG"],platforms:["PC"]};
  const entry=journalItemSchema.parse({id:randomUUID(),game,date:"2026-11-06",kind:"session",minutes:60,notes:"Legacy private note",progress:"Private progress",tags:["Secret"],spoiler:true,rating:null});
  const record=(userId:string,id:string)=>({userId,id,slug:game.slug,title:game.title,game,entryDate:new Date("2026-11-06T00:00:00Z"),kind:"session",minutes:60,notes:"Normalized private note",progress:"Private progress",tags:["Secret"],spoiler:true,rating:null,searchText:"Fixture"});
  try {
    for(let i=0;i<3;i++)users.push((await prisma.user.create({data:{email:"export-"+randomUUID()+"@example.invalid",passwordHash:"disabled-test-account"}})).id);
    const [alice,bob,fresh]=users;
    await prisma.userWorkspace.create({data:{userId:alice,journalMigrated:true,version:4,data:workspaceSchema.parse({profile:{name:"Before",bio:"Private"}}) as Prisma.InputJsonValue}});
    await prisma.userWorkspace.create({data:{userId:bob,journalMigrated:false,version:7,data:workspaceSchema.parse({journal:[entry]}) as Prisma.InputJsonValue}});
    await prisma.libraryEntry.create({data:{userId:alice,slug:game.slug,game,status:"Completed",favorite:true,rating:9,hours:120,notes:"Before",addedAt:new Date("2026-01-01T00:00:00Z")}});
    await prisma.libraryEntry.createMany({data:Array.from({length:130},(_,i)=>{const slug="steam-"+(1000+i);return{userId:alice,slug,game:{...game,id:slug,slug},notes:"Private extra library note"};})});
    await prisma.journalRecord.createMany({data:Array.from({length:2055},()=>record(alice,randomUUID()))});
    let started!:()=>void, release!:()=>void; const snapshotRead=new Promise<void>(r=>{started=r}), resume=new Promise<void>(r=>{release=r});
    const wrapped=new Proxy(prisma,{get(target,property){if(property!=="$transaction")return Reflect.get(target,property);return (callback:any,options:any)=>target.$transaction(tx=>callback(new Proxy(tx,{get(transaction,key){if(key!=="userWorkspace")return Reflect.get(transaction,key);return new Proxy(transaction.userWorkspace,{get(delegate,method){if(method!=="findUnique")return Reflect.get(delegate,method);return async(args:any)=>{const row=await delegate.findUnique(args);started();await resume;return row;};}});}})),options);}}) as PrismaClient;
    const pending=readPrivateExport(wrapped,alice);
    try {
      await snapshotRead;
      await prisma.$transaction(async tx=>{await tx.userWorkspace.update({where:{userId:alice},data:{version:{increment:1},data:workspaceSchema.parse({profile:{name:"After",bio:"Private"}}) as Prisma.InputJsonValue}});await tx.libraryEntry.update({where:{userId_slug:{userId:alice,slug:game.slug}},data:{notes:"After"}});await tx.journalRecord.create({data:record(alice,randomUUID())});});
    } finally {release();}
    const exported=JSON.parse(await pending); assert.equal(exported.data.workspace.profile.name,"Before");assert.equal(exported.data.library.find((e:any)=>e.game.slug===game.slug).notes,"Before");assert.equal(exported.data.library.length,131);assert.equal(new Set(exported.data.library.map((e:any)=>e.game.slug)).size,131);assert.equal(exported.data.journal.length,2055);assert.equal(new Set(exported.data.journal.map((r:any)=>r.id)).size,2055);assert.equal(exported.data.journal[0].spoiler,true);assert.equal(exported.data.journal[0].progress,"Private progress");assert.equal(exported.consistency.workspaceVersion,4);
    const current=JSON.parse(await readPrivateExport(prisma,alice));assert.equal(current.data.workspace.profile.name,"After");assert.equal(current.data.journal.length,2056);
    const beforePreparation = await prisma.userWorkspace.findUniqueOrThrow({where:{userId:alice}});
    const beforeLibrary = await prisma.libraryEntry.findMany({where:{userId:alice},orderBy:{slug:"asc"}});
    const beforeJournal = await prisma.journalRecord.findMany({where:{userId:alice},orderBy:{id:"asc"}});
    const planTime = Date.now(), secret = "disposable-restore-plan-secret-for-tests-only";
    const plan = prepareRestore(alice,exported,current,secret,planTime);
    assert.equal(plan.counts[1].inDestination,2056); assert.equal(plan.counts[1].keep,2055);
    assert.equal(verifyRestorePlan(plan.planToken,alice,exported,current,secret,planTime),true);
    assert.equal(verifyRestorePlan(plan.planToken,bob,exported,current,secret,planTime),false);
    assert.deepEqual(await prisma.userWorkspace.findUniqueOrThrow({where:{userId:alice}}),beforePreparation);
    assert.deepEqual(await prisma.libraryEntry.findMany({where:{userId:alice},orderBy:{slug:"asc"}}),beforeLibrary);
    assert.deepEqual(await prisma.journalRecord.findMany({where:{userId:alice},orderBy:{id:"asc"}}),beforeJournal);
    await prisma.libraryEntry.update({where:{userId_slug:{userId:alice,slug:game.slug}},data:{notes:"Changed after preparation"}});
    const changedDestination=JSON.parse(await readPrivateExport(prisma,alice));
    assert.equal(changedDestination.consistency.workspaceVersion,current.consistency.workspaceVersion);
    assert.equal(verifyRestorePlan(plan.planToken,alice,exported,changedDestination,secret,planTime),false);
    const legacyBefore=await prisma.userWorkspace.findUniqueOrThrow({where:{userId:bob}});const legacy=JSON.parse(await readPrivateExport(prisma,bob));assert.equal(legacy.source.journalMode,"legacy");assert.equal(legacy.data.journal.length,1);assert.equal(legacy.data.journal[0].notes,"Legacy private note");assert.equal(legacy.data.library.length,0);assert.deepEqual(await prisma.userWorkspace.findUniqueOrThrow({where:{userId:bob}}),legacyBefore);assert.equal(await prisma.journalRecord.count({where:{userId:bob}}),0);
    const empty=JSON.parse(await readPrivateExport(prisma,fresh));assert.equal(empty.consistency.workspaceVersion,null);assert.equal(await prisma.userWorkspace.count({where:{userId:fresh}}),0);
    await assert.rejects(readPrivateExport(prisma,alice,512));
  } finally {await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.$disconnect();}
});
