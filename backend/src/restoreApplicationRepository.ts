import {Prisma,type PrismaClient} from "@prisma/client";
import {prisma} from "./db.js";
import {config} from "./config.js";
import {readPrivateExportTransaction} from "./privateExportRepository.js";
import {verifyRestorePlan,restoreChanges,validateRestoreDocument,RestorePreparationError} from "./restorePreparation.js";
import type {RestoreApplicationRepository,RestoreResult} from "./restoreApplication.js";
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function applyAccountRestore(client:PrismaClient,userId:string,backup:unknown,planToken:string,secret:string,now=Date.now()):Promise<RestoreResult>{
 const source=validateRestoreDocument(backup);
 try{return await client.$transaction(async tx=>{
   // Serializable reads lock the complete account ranges (including empty ranges), not only metadata.
   const destination=JSON.parse(await readPrivateExportTransaction(tx,userId));
   if(!verifyRestorePlan(planToken,userId,source,destination,secret,Math.max(now,Date.now())))throw new RestorePreparationError(409,"The plan expired or account/source data changed. Reload and prepare a new plan.");
   const changes=restoreChanges(source,destination);
   if(changes.library.length+changes.journal.length>5000)throw new RestorePreparationError(413,"Restore up to 5,000 new library/journal records per transaction. No data was changed.");
   for(let start=0;start<changes.library.length;start+=100){await tx.libraryEntry.createMany({data:changes.library.slice(start,start+100).map(row=>({userId,slug:row.game.slug,game:json(row.game),status:row.status,favorite:row.favorite,rating:row.rating,hours:row.hours,notes:row.notes,addedAt:new Date(row.addedAt)}))});}
   for(let start=0;start<changes.journal.length;start+=100){await tx.journalRecord.createMany({data:changes.journal.slice(start,start+100).map(row=>({userId,id:row.id,slug:row.game.slug,title:row.game.title,game:json(row.game),entryDate:new Date(row.date+"T00:00:00Z"),kind:row.kind,minutes:row.minutes,notes:row.notes,progress:row.progress,tags:json(row.tags),spoiler:row.spoiler,rating:row.rating,version:0,searchText:[row.date,row.game.title,row.notes,row.progress,...row.tags].join(" ")}))});}
   const result=await tx.userWorkspace.updateMany({where:{userId,version:destination.consistency.workspaceVersion,journalMigrated:true},data:{data:json(changes.workspace),version:{increment:1}}});
   if(result.count!==1)throw new RestorePreparationError(409,"The account workspace changed. Reload and prepare a new plan.");
   return {restored:true,libraryAdded:changes.library.length,journalAdded:changes.journal.length,workspaceVersion:destination.consistency.workspaceVersion+1};
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:30000});}
 catch(error){if(error instanceof RestorePreparationError)throw error;if(error&&typeof error==="object"&&"code" in error&&["P2002","P2034"].includes(String(error.code)))throw new RestorePreparationError(409,"Concurrent changes or database-equivalent identifiers prevented restore. The transaction was rolled back. Reload and prepare a new plan.");throw error;}
}
export const databaseRestoreApplication:RestoreApplicationRepository={apply:(userId,backup,planToken)=>applyAccountRestore(prisma,userId,backup,planToken,config.JWT_SECRET)};
