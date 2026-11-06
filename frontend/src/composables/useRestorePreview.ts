import { ref, shallowRef, computed, watch, onScopeDispose } from "vue";
import { useAuthStore } from "../stores/auth";
import { useLibraryStore } from "../stores/library";
import { useWorkspaceStore } from "../stores/workspace";
import { createOperationScope } from "../utils/requestScope";
import { accountExport, deviceExport, PRIVATE_EXPORT_MAX_BYTES } from "../services/privateExport";
import { parsePrivateBackup, comparePrivateBackups, PreviewValidationError } from "../utils/restorePreview";
export type PreviewFile = Pick<File, "name" | "size" | "arrayBuffer">;
export function useRestorePreview() {
  const auth = useAuthStore(), library = useLibraryStore(), workspace = useWorkspaceStore();
  const destination = ref<"device" | "account">(auth.token && auth.user ? "account" : "device");
  const file = shallowRef<PreviewFile | null>(null), preview = shallowRef<ReturnType<typeof comparePrivateBackups> | null>(null);
  const busy = ref(false), error = ref(""), fileInvalid = ref(false), inputRevision = ref(0);
  const operation = createOperationScope(() => [auth.token, auth.user?.id, workspace.sessionKey, destination.value, file.value]);
  function reset() { operation.invalidate(); preview.value = null; busy.value = false; error.value = ""; fileInvalid.value = false; }
  function clear() { reset(); file.value = null; inputRevision.value++; }
  function select(value: PreviewFile | null) { reset(); file.value = value; }
  const blockedReason = computed(() => {
    if (!file.value) return "Choose a JSON backup file to preview.";
    if (library.pending || workspace.busy || workspace.importing) return "Wait for pending saves and imports before comparing saved data.";
    if (destination.value === "account") {
      if (!auth.token || !auth.user) return "Sign in to preview against an account.";
      if (library.accountId !== auth.user.id || library.syncState !== "ready" || workspace.sessionKey !== auth.user.id || !workspace.ready || workspace.error || library.syncError) return "Load or reload your account before comparing conflicts.";
    } else if (library.storageError || workspace.deviceUnreadable || (!workspace.account && workspace.error)) return "Recover the saved device data before comparing conflicts. Unavailable data will not be treated as empty.";
    return "";
  });
  watch(() => [auth.token, auth.user?.id, workspace.sessionKey], () => { clear(); destination.value = auth.token && auth.user ? "account" : "device"; }, { flush: "sync" });
  watch(destination, reset, { flush: "sync" });
  watch(blockedReason, reason => { if (reason) reset(); }, { flush: "sync" });
  function invalidateSavedComparison() {
    if (!busy.value && !preview.value) return;
    reset();
    error.value = "Saved destination data may have changed. Preview the selected backup again. No data was changed.";
  }
  // Store changes in this tab are observable; another tab cannot update these refs.
  watch(() => [library.entries, workspace.data], () => {
    if (destination.value === "account" || !workspace.account) invalidateSavedComparison();
  }, { deep: true, flush: "sync" });
  function storageChanged(event: StorageEvent) {
    if (destination.value === "device" && (event.key === null || event.key === "gamevault_library_v1" || event.key === "gamevault_workspace_v1")) invalidateSavedComparison();
  }
  function visibleAgain() {
    if (document.visibilityState === "visible") invalidateSavedComparison();
  }
  if (typeof window !== "undefined") {
    window.addEventListener("storage", storageChanged);
    window.addEventListener("focus", invalidateSavedComparison);
  }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", visibleAgain);
  onScopeDispose(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("focus", invalidateSavedComparison);
    }
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visibleAgain);
    clear(); operation.dispose();
  });
  async function run() {
    if (busy.value || blockedReason.value || !file.value) return false;
    const current = operation.next(), chosen = file.value, target = destination.value, token = auth.token;
    busy.value = true; error.value = ""; fileInvalid.value = false; preview.value = null;
    let stage: "file" | "destination" = "file";
    try {
      if (!Number.isSafeInteger(chosen.size) || chosen.size <= 0 || chosen.size > PRIVATE_EXPORT_MAX_BYTES) throw new PreviewValidationError("Choose a non-empty JSON backup no larger than 32 MiB.");
      const bytes = await chosen.arrayBuffer();
      if (!current()) return false;
      if (bytes.byteLength !== chosen.size || bytes.byteLength > PRIVATE_EXPORT_MAX_BYTES) throw new PreviewValidationError("The complete backup file could not be read within its size limit.");
      let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new PreviewValidationError("The backup must contain valid UTF-8 JSON text."); }
      const backup = parsePrivateBackup(text);
      if (!current()) return false;
      stage = "destination";
      const saved = await (target === "account" ? accountExport(token!) : Promise.resolve(deviceExport(localStorage)));
      if (!current()) return false;
      const existing = parsePrivateBackup(saved.body);
      preview.value = comparePrivateBackups(backup, existing);
      return true;
    } catch (reason) {
      if (current()) {
        fileInvalid.value = stage === "file";
        error.value = stage === "file" ? reason instanceof PreviewValidationError ? reason.message : "The backup file could not be read or validated." : "Saved destination data could not be read completely. Reload or recover it and retry. No data was changed.";
      }
      return false;
    } finally { if (current()) busy.value = false; }
  }
  return { destination, file, preview, busy, error, fileInvalid, inputRevision, blockedReason, select, clear, run };
}
