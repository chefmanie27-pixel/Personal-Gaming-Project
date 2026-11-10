import {test} from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {issueToken} from "../src/auth.js";
import {PrivateExportBuilder} from "../src/privateExport.js";
import {workspaceSchema} from "../src/workspace.js";
import {createRestoreApplicationRouter} from "../src/restoreApplication.js";
import {RestorePreparationError} from "../src/restorePreparation.js";
test("account apply requires ownership, explicit confirmation and valid backup before repository access",async()=>{
 let calls=0,lastUser="";let failure=false;const backup=JSON.parse(new PrivateExportBuilder(workspaceSchema.parse({}),"normalized",0).finish());
 const app=express();app.use("/restore",createRestoreApplicationRouter({async apply(user){calls++;lastUser=user;if(failure)throw new RestorePreparationError(409,"Stale plan");return{restored:true,libraryAdded:2,journalAdded:3,workspaceVersion:4};}}));const server=app.listen(0);await new Promise<void>(r=>server.once("listening",r));const address=server.address();assert.ok(address&&typeof address!=="string");const body={destination:"account",policy:"destination-wins-v1",uploadConsent:true,confirmApply:true,planToken:"token",backup};
 const post=(value:unknown,user="alice")=>fetch("http://127.0.0.1:"+address.port+"/restore/apply",{method:"POST",headers:{"Content-Type":"application/json",...(user?{Authorization:"Bearer "+issueToken({id:user,role:"USER"})}:{})},body:JSON.stringify(value)});
 try{assert.equal((await post(body,"")).status,401);for(const invalid of [{...body,confirmApply:false},{...body,uploadConsent:false},{...body,userId:"bob"},{...body,backup:null}])assert.equal((await post(invalid)).status,400);assert.equal(calls,0);const result=await post(body);assert.equal(result.status,200);assert.equal(result.headers.get("cache-control"),"no-store");assert.equal((await result.json()).restored,true);assert.equal(lastUser,"alice");failure=true;assert.equal((await post(body)).status,409);}finally{await new Promise<void>((r,e)=>server.close(error=>error?e(error):r()));}
});
