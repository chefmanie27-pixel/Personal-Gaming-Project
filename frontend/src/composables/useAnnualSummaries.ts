import { ref, watch, onScopeDispose, type Ref } from "vue";
import { useAuthStore } from "../stores/auth";
import { useWorkspaceStore } from "../stores/workspace";
import { useJournalStore, journalClient, type JournalSummary } from "../stores/journal";
import { createOperationScope } from "../utils/requestScope";

export function useAnnualSummaries(year: Ref<number>) {
  const auth = useAuthStore(), workspace = useWorkspaceStore(), journal = useJournalStore();
  const selected = ref<JournalSummary | null>(null), previous = ref<JournalSummary | null>(null);
  const loading = ref(false), previousLoading = ref(false), error = ref(""), previousError = ref("");
  const context = () => [year.value, auth.token, auth.user?.id, workspace.sessionKey, workspace.journalMode, journal.ready];
  const selectedScope = createOperationScope(context), previousScope = createOperationScope(context);
  async function load(prior = false) {
    const current = (prior ? previousScope : selectedScope).next();
    const data = prior ? previous : selected, pending = prior ? previousLoading : loading, problem = prior ? previousError : error;
    data.value = null; pending.value = false; problem.value = "";
    const target = year.value - (prior ? 1 : 0);
    if (!journal.remote || !journal.ready || !Number.isInteger(target) || target < 1970 || target > 2100) return;
    pending.value = true;
    try {
      const response = await journalClient.get("/journal/summary", { params: { year: target }, headers: { Authorization: "Bearer " + auth.token } });
      if (current()) data.value = response.data.data;
    } catch {
      if (current()) problem.value = "Annual journal statistics could not load. Please retry.";
    } finally {
      if (current()) pending.value = false;
    }
  }
  watch(context, () => { void load(); void load(true); }, { immediate: true, flush: "sync" });
  onScopeDispose(() => { selectedScope.dispose(); previousScope.dispose(); });
  return { selected, previous, loading, previousLoading, error, previousError, load };
}
