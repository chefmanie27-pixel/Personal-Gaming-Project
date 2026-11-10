import {computed,ref,watch,onScopeDispose} from "vue";
import axios from "axios";
import {useAuthStore} from "../stores/auth";
import {useLibraryStore} from "../stores/library";
import {useWorkspaceStore} from "../stores/workspace";
import {useJournalStore} from "../stores/journal";
import {createOperationScope} from "../utils/requestScope";
import {parsePrivateBackup} from "../utils/restorePreview";
import {requestAccountRestore,RestorePreparationError} from "../services/restorePreparation";
import type {useRestorePreview} from "./useRestorePreview";
import type {useRestorePreparation} from "./useRestorePreparation";
export function useAccountRestore(context:ReturnType<typeof useRestorePreview>,preparation:ReturnType<typeof useRestorePreparation>,unsavedPreferences:()=>boolean=()=>false){
 const auth=useAuthStore(),library=useLibraryStore(),workspace=useWorkspaceStore(),journal=useJournalStore();
 const confirmation=ref(""),applying=ref(false),reloading=ref(false),message=ref(""),error=ref(""),needsReload=ref(false);
 const operation=createOperationScope(()=>[auth.token,auth.user?.id,workspace.sessionKey,context.file.value,context.destination.value]);
 function reset(){operation.invalidate();confirmation.value="";applying.value=false;reloading.value=false;message.value="";error.value="";needsReload.value=false;}
 watch(()=>[auth.token,auth.user?.id,workspace.sessionKey,context.file.value,context.destination.value],reset,{flush:"sync"});
 watch(preparation.plan,()=>{confirmation.value="";},{flush:"sync"});
 const blocked=computed(()=>unsavedPreferences()||applying.value||reloading.value||needsReload.value||preparation.busy.value||preparation.blocked.value||!preparation.plan.value?.applyAvailable||!preparation.reviewed.value||confirmation.value.trim()!==auth.user?.email);
 async function refresh(current:()=>boolean,token:string,user:string){
  if(!current())return false;
  await library.refresh();if(!current())return false;
  await workspace.connect(token,user);if(!current())return false;
  await journal.load(true);if(!current())return false;
  return library.syncState==="ready"&&!library.syncError&&workspace.ready&&!workspace.error&&!journal.error;
 }
 async function apply(){
  if(blocked.value||!context.file.value||!preparation.plan.value||!auth.token||!auth.user)return false;
  const chosen=context.file.value,plan=preparation.plan.value,token=auth.token,user=auth.user.id,current=operation.next();
  applying.value=true;error.value="";message.value="";let sent=false,committed=false;
  try{
   if(Date.parse(plan.expiresAt)<=Date.now())throw new Error("Expired plan");
   const bytes=await chosen.arrayBuffer();if(!current())return false;
   if(bytes.byteLength!==chosen.size)throw new Error("Incomplete file");
   const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);parsePrivateBackup(text);
   if(!current()||preparation.plan.value!==plan||!preparation.reviewed.value||!preparation.consent.value||unsavedPreferences()||confirmation.value.trim()!==auth.user?.email||Date.parse(plan.expiresAt)<=Date.now())return false;
   sent=true;const result=await requestAccountRestore(token,JSON.parse(text),plan.planToken);if(!current())return false;
   committed=true;preparation.discard();needsReload.value=true;
   message.value="Restore committed: "+result.libraryAdded+" library games and "+result.journalAdded+" journal entries added. Existing account records were kept.";
   const loaded=await refresh(current,token,user);if(!current())return false;
   needsReload.value=!loaded;if(!loaded)error.value="The restore committed, but saved account data could not be fully reloaded. Reload before editing or preparing another plan.";
   return true;
  }catch(reason){if(current()){
   preparation.discard();const locallyRejected=reason instanceof RestorePreparationError;needsReload.value=sent&&!locallyRejected;
   const rejected=axios.isAxiosError(reason)&&[400,401,409,413].includes(reason.response?.status??0);
   error.value=committed?"The restore committed, but account data could not be fully reloaded. Reload before editing or restoring again.":!sent||locallyRejected?"The selected backup or plan could not be confirmed. Preview and prepare again; no restore request was sent.":rejected?"The restore request was rejected. Reload saved account data, then preview and prepare a new plan.":"Restore completion is uncertain. Reload saved account data before retrying; any committed entries will be kept on the next plan.";
  }return false;}finally{if(current())applying.value=false;}
 }
 async function reload(){
  if(applying.value||reloading.value||!auth.token||!auth.user)return false;
  const current=operation.next(),token=auth.token,user=auth.user.id;reloading.value=true;
  try{const loaded=await refresh(current,token,user);if(!current())return false;
   needsReload.value=!loaded;if(loaded){error.value="";message.value=message.value.startsWith("Restore committed")?message.value:"Saved account data reloaded. Preview and prepare a fresh plan before retrying; existing entries will be kept.";}else error.value="Saved account data could not be fully reloaded. Retry reload before restoring.";return loaded;
  }catch{if(current())error.value="Saved account data could not be fully reloaded. Retry reload before restoring.";return false;}finally{if(current())reloading.value=false;}
 }
 onScopeDispose(()=>{reset();operation.dispose();});
 return{confirmation,applying,reloading,message,error,needsReload,blocked,apply,reload};
}
