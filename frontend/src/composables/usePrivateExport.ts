import { ref, computed, watch, onScopeDispose } from "vue";
import { useAuthStore } from "../stores/auth";
import { useLibraryStore } from "../stores/library";
import { useWorkspaceStore } from "../stores/workspace";
import { createOperationScope } from "../utils/requestScope";
import { accountExport, deviceExport, downloadPrivateExport, exportMessage, type ExportFile } from "../services/privateExport";
export function usePrivateExport(download: (data: ExportFile) => void = downloadPrivateExport) {
  const auth = useAuthStore(), library = useLibraryStore(), workspace = useWorkspaceStore();
  const source = ref<"account" | "device">(auth.token && auth.user ? "account" : "device"), busy = ref(false), error = ref(""), notice = ref("");
  const operation = createOperationScope(() => [source.value, auth.token, auth.user?.id, workspace.sessionKey]);
  function reset() { operation.invalidate(); busy.value = false; error.value = ""; notice.value = ""; }
  watch(() => [auth.token, auth.user?.id, workspace.sessionKey], () => { reset(); source.value = auth.token && auth.user ? "account" : "device"; }, { flush: "sync" });
  watch(source, reset, { flush: "sync" });
  onScopeDispose(() => { reset(); operation.dispose(); });
  const blockedReason = computed(() => {
    if (library.pending || workspace.busy || workspace.importing) return "Wait for pending saves and imports before exporting.";
    if (source.value === "account") {
      if (!auth.token || !auth.user) return "Sign in to export account data.";
      if (library.accountId !== auth.user.id || library.syncState !== "ready" || workspace.sessionKey !== auth.user.id || !workspace.ready || workspace.error || library.syncError) return "Load or reload your account data before exporting.";
    } else if (library.storageError || workspace.deviceUnreadable || (!workspace.account && workspace.error)) return "Recover the device data before exporting a structured backup. Original-text recovery downloads remain available.";
    return "";
  });
  async function start() {
    if (busy.value || blockedReason.value) return false;
    const current = operation.next(), selected = source.value, token = auth.token;
    busy.value = true; error.value = ""; notice.value = "";
    try {
      const result = await (selected === "account" ? accountExport(token!) : Promise.resolve(deviceExport(localStorage)));
      if (!current()) return false;
      download(result); notice.value = "Download started. This file includes private notes and preferences."; return true;
    } catch (reason) { if (current()) error.value = exportMessage(reason, selected); return false; }
    finally { if (current()) busy.value = false; }
  }
  return { source, busy, error, notice, blockedReason, start };
}
