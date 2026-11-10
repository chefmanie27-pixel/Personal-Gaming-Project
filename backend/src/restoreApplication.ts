import express,{Router,type ErrorRequestHandler} from "express";
import {z} from "zod";
import {requireAuth,type AuthRequest} from "./auth.js";
import {validateRestoreDocument,RestorePreparationError} from "./restorePreparation.js";
import {PRIVATE_EXPORT_MAX_BYTES} from "./privateExport.js";
export interface RestoreResult { restored: true; libraryAdded: number; journalAdded: number; workspaceVersion: number; }
export interface RestoreApplicationRepository { apply(userId:string,backup:unknown,planToken:string):Promise<RestoreResult>; }
export function createRestoreApplicationRouter(repo:RestoreApplicationRepository){
 const router=Router();router.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});router.use(requireAuth);
 router.post("/apply",express.json({limit:PRIVATE_EXPORT_MAX_BYTES,inflate:false,verify:(_req,_res,bytes)=>{new TextDecoder("utf-8",{fatal:true}).decode(bytes);}}),async(req:AuthRequest,res)=>{
  const input=z.object({destination:z.literal("account"),policy:z.literal("destination-wins-v1"),uploadConsent:z.literal(true),confirmApply:z.literal(true),planToken:z.string().min(1).max(4096),backup:z.unknown()}).strict().safeParse(req.body);
  if(!input.success||Object.keys(req.query).length)return res.status(400).json({error:"Explicit account restore confirmation and a current plan are required."});
  try{validateRestoreDocument(input.data.backup);return res.json(await repo.apply(req.user!.id,input.data.backup,input.data.planToken));}
  catch(error){if(error instanceof RestorePreparationError)return res.status(error.status).json({error:error.message});return res.status(503).json({error:"Restore could not be confirmed. Reload saved account data before preparing again; the response may have been interrupted."});}
 });
 const parseError:ErrorRequestHandler=(error,_req,res,_next)=>{res.status(error.status===413?413:400).json({error:"The restore request is malformed, unsupported or exceeds 32 MiB."});};router.use(parseError);return router;
}
