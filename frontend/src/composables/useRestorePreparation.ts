import { computed, ref, shallowRef, watch, onScopeDispose } from "vue";
import { useAuthStore } from "../stores/auth";
import { useWorkspaceStore } from "../stores/workspace";
import { createOperationScope } from "../utils/requestScope";
import { parsePrivateBackup } from "../utils/restorePreview";
import { PRIVATE_EXPORT_MAX_BYTES } from "../services/privateExport";
import { requestRestorePreparation, preparationMessage, RestorePreparationError, type RestorePlan } from "../services/restorePreparation";
import type { useRestorePreview } from "./useRestorePreview";
export function useRestorePreparation(context: ReturnType<typeof useRestorePreview>) {
  const auth = useAuthStore(), workspace = useWorkspaceStore();
  const consent = ref(false), busy = ref(false), error = ref(""), reviewed = ref(false);
  const plan = shallowRef<RestorePlan | null>(null);
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const operation = createOperationScope(()=>[auth.token,auth.user?.id,workspace.sessionKey,context.destination.value,context.file.value,context.preview.value,consent.value]);
  function resetPlan() {
    operation.invalidate(); if (expiryTimer !== undefined) clearTimeout(expiryTimer); expiryTimer = undefined;
    plan.value = null; reviewed.value = false; busy.value = false; error.value = "";
  }
  function reset() { resetPlan(); consent.value = false; }
  watch(()=>[auth.token,auth.user?.id,workspace.sessionKey,context.destination.value,context.file.value,context.preview.value,context.busy.value,context.blockedReason.value], reset, {flush:"sync"});
  watch(consent,value=>{if(!value) resetPlan();},{flush:"sync"});
  const blocked = computed(()=>context.destination.value !== "account" || !auth.token || !auth.user || !context.preview.value || context.busy.value || !!context.blockedReason.value || !consent.value);
  async function prepare() {
    if (busy.value || blocked.value || !context.file.value) return false;
    resetPlan(); const current = operation.next(), chosen = context.file.value, token = auth.token!;
    busy.value = true;
    try {
      if (!Number.isSafeInteger(chosen.size) || chosen.size <= 0 || chosen.size > PRIVATE_EXPORT_MAX_BYTES) throw new RestorePreparationError("Choose a non-empty backup no larger than 32 MiB.");
      const bytes = await chosen.arrayBuffer(); if (!current()) return false;
      if (bytes.byteLength !== chosen.size) throw new RestorePreparationError("The complete selected file could not be read. Nothing was uploaded.");
      const text = new TextDecoder("utf-8",{fatal:true}).decode(bytes);
      parsePrivateBackup(text); // Validate locally, but upload original fields without transformations.
      if (!current()) return false;
      const result = await requestRestorePreparation(token,JSON.parse(text)); if (!current()) return false;
      plan.value = result;
      expiryTimer = setTimeout(()=>{
        if (plan.value !== result) return;
        reset(); error.value = "This server plan expired. Renew consent and prepare a fresh plan. Nothing was restored.";
      }, Math.max(0,Date.parse(result.expiresAt)-Date.now()));
      return true;
    } catch (reason) { if (current()) error.value = preparationMessage(reason); return false; }
    finally { if (current()) busy.value = false; }
  }
  onScopeDispose(()=>{reset();operation.dispose();});
  return {consent,busy,error,reviewed,plan,blocked,prepare,discard:reset};
}
