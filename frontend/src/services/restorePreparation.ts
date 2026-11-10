import axios from "axios";
import { privateExportClient, PRIVATE_EXPORT_MAX_BYTES } from "./privateExport";
export const RESTORE_PLAN_LABELS = ["Library games", "Journal entries", "Collections", "Goals", "Watches", "Metadata", "Feedback", "Alert-rule preferences"] as const;
export interface RestorePlan {
  planToken: string; expiresAt: string; policy: "destination-wins-v1"; applyAvailable: boolean;
  counts: { label: string; inFile: number; inDestination: number; add: number; keep: number }[];
}
export class RestorePreparationError extends Error {}
export function validateRestorePlan(value: any, now = Date.now()): RestorePlan {
  const invalid = () => { throw new RestorePreparationError("The server returned an invalid or expired plan. Prepare again; nothing was restored."); };
  if (!value || value.policy !== "destination-wins-v1" || typeof value.applyAvailable !== "boolean" || typeof value.planToken !== "string" || value.planToken.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value.planToken) || typeof value.expiresAt !== "string") invalid();
  const expiry = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 640000 || !Array.isArray(value.counts) || value.counts.length !== 8) invalid();
  const counts = value.counts.map((row: any, index: number) => {
    if (!row || row.label !== RESTORE_PLAN_LABELS[index] || ![row.inFile,row.inDestination,row.add,row.keep].every(n=>Number.isSafeInteger(n) && n >= 0 && n <= 100000) || row.add + row.keep !== row.inFile || row.keep > row.inDestination) invalid();
    return {label: row.label, inFile: row.inFile, inDestination: row.inDestination, add: row.add, keep: row.keep};
  });
  return {planToken:value.planToken,expiresAt:value.expiresAt,policy:"destination-wins-v1",applyAvailable:value.applyAvailable,counts};
}
export async function requestRestorePreparation(token: string, backup: unknown): Promise<RestorePlan> {
  const body = JSON.stringify({destination:"account",policy:"destination-wins-v1",uploadConsent:true,backup});
  if (new TextEncoder().encode(body).length > PRIVATE_EXPORT_MAX_BYTES) throw new RestorePreparationError("The backup and upload envelope exceed 32 MiB. Nothing was uploaded.");
  const response = await privateExportClient.post("/private-restore/prepare", body, {headers:{Authorization:"Bearer " + token,"Content-Type":"application/json"}});
  return validateRestorePlan(response.data);
}
export function preparationMessage(error: unknown) {
  if (error instanceof RestorePreparationError) return error.message;
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return "Sign in again before preparing an account plan.";
    if (error.response?.status === 400) return "The backup is not compatible with the account schemas. Its fields and identifiers were not converted. Nothing was restored.";
    if (error.response?.status === 409) return "The account layout, combined limits or ambiguous identifiers prevent preparation. Review compatibility and refresh the preview. Nothing was restored.";
    if (error.response?.status === 413) return "The request or transaction limit was exceeded: 32 MiB per request and 5,000 new library/journal records per restore. Nothing was restored.";
  }
  return "The complete server plan could not be prepared. Retry when account data is available. Nothing was restored.";
}

export async function requestAccountRestore(token:string,backup:unknown,planToken:string){
 const body=JSON.stringify({destination:"account",policy:"destination-wins-v1",uploadConsent:true,confirmApply:true,planToken,backup});
 if(new TextEncoder().encode(body).length>PRIVATE_EXPORT_MAX_BYTES)throw new RestorePreparationError("The confirmed restore request exceeds 32 MiB.");
 const response=await privateExportClient.post("/private-restore/apply",body,{headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"}});
 const data=response.data;
 if(!data||data.restored!==true||![data.libraryAdded,data.journalAdded,data.workspaceVersion].every(n=>Number.isSafeInteger(n)&&n>=0)||data.libraryAdded+data.journalAdded>5000)throw new Error("Unconfirmed restore response");
 return data as {restored:true;libraryAdded:number;journalAdded:number;workspaceVersion:number};
}
