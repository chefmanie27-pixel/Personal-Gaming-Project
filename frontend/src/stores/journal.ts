import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import axios from "axios";
import { useAuthStore } from "./auth";
import { useWorkspaceStore, type JournalItem } from "./workspace";
import type { Game } from "../types";
export interface JournalSummary {
  minutes: number;
  monthly: number[];
  genres: [string, number][];
  mostPlayed: {
    game: Pick<Game, "id" | "slug" | "title" | "cover">;
    minutes: number;
  } | null;
  highestRated: {
    game: Pick<Game, "id" | "slug" | "title" | "cover">;
    rating: number;
  } | null;
}
export const journalClient = axios.create({
  baseURL: import.meta.env?.VITE_API_URL ?? "http://localhost:3000/api",
  timeout: 20000,
});
export const useJournalStore = defineStore("journal", () => {
  const workspace = useWorkspaceStore(),
    auth = useAuthStore();
  const remote = computed(
    () => workspace.account && workspace.journalMode === "normalized",
  );
  const entries = ref<JournalItem[]>([]),
    loading = ref(false),
    busy = ref(false),
    error = ref(""),
    hasMore = ref(false),
    summary = ref<JournalSummary | null>(null),
    summaryLoading = ref(false),
    summaryError = ref("");
  let cursor: { date: string; id: string } | null = null;
  let generation = 0,
    summaryGeneration = 0,
    mutationGeneration = 0;
  let currentFilters = { q: "", kind: "" };
  const ready = computed(
    () => workspace.ready && (!remote.value || !!auth.user),
  );
  watch(
    () => [workspace.sessionKey, workspace.journalMode] as const,
    () => {
      generation++;
      summaryGeneration++;
      mutationGeneration++;
      entries.value = [];
      cursor = null;
      hasMore.value = false;
      error.value = "";
      summary.value = null;
      summaryError.value = "";
      loading.value = false;
      busy.value = false;
      summaryLoading.value = false;
    },
  );
  const headers = () => ({ Authorization: "Bearer " + auth.token });
  function localRows() {
    return workspace.data.journal
      .filter(
        (e) =>
          (!currentFilters.kind || e.kind === currentFilters.kind) &&
          [e.date, e.game.title, e.notes, e.progress, ...e.tags]
            .join(" ")
            .toLowerCase()
            .includes(currentFilters.q.toLowerCase()),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }
  async function load(reset = true, filters = currentFilters) {
    currentFilters = { ...filters };
    if (!ready.value) return;
    if (!reset && loading.value) return;
    const revision = ++generation,
      key = workspace.sessionKey,
      token = auth.token;
    loading.value = true;
    error.value = "";
    if (reset) {
      entries.value = [];
      cursor = null;
      hasMore.value = false;
    }
    try {
      if (remote.value) {
        const response = await journalClient.get("/journal", {
          params: {
            q: filters.q,
            kind: filters.kind || undefined,
            limit: 24,
            cursor: cursor ? JSON.stringify(cursor) : undefined,
          },
          headers: headers(),
        });
        if (
          revision !== generation ||
          key !== workspace.sessionKey ||
          token !== auth.token
        )
          return;
        entries.value = [
          ...new Map(
            [...entries.value, ...response.data.data].map((e) => [e.id, e]),
          ).values(),
        ];
        cursor = response.data.meta.nextCursor;
        hasMore.value = response.data.meta.hasMore;
      } else {
        const all = localRows();
        const size = reset ? 24 : entries.value.length + 24;
        entries.value = all.slice(0, size);
        hasMore.value = all.length > size;
      }
    } catch {
      if (revision === generation)
        error.value = "Journal entries could not load. Please retry.";
    } finally {
      if (revision === generation) loading.value = false;
    }
  }
  function message(reason: unknown) {
    return axios.isAxiosError(reason) && reason.response?.status === 409
      ? "This entry changed in another session. Reload the list and select Edit again. Your draft is kept."
      : "The journal change could not be confirmed. Reload before retrying; your previous draft is kept.";
  }
  async function save(entry: JournalItem, editing = false) {
    if (!ready.value || busy.value) return false;
    const revision = ++mutationGeneration,
      key = workspace.sessionKey,
      token = auth.token;
    busy.value = true;
    error.value = "";
    try {
      if (remote.value) {
        const { version, ...payload } = entry;
        if (editing) {
          if (version === undefined) throw new Error("Missing entry version");
          await journalClient.patch(
            "/journal/" + entry.id,
            { version, entry: payload },
            { headers: headers() },
          );
        } else
          await journalClient.post("/journal", payload, { headers: headers() });
      } else {
        const saved = await workspace.change((d) => {
          const index = d.journal.findIndex((e) => e.id === entry.id);
          if (index < 0) d.journal.push(entry);
          else d.journal[index] = entry;
        });
        if (!saved) throw new Error("Device write failed");
      }
      if (
        revision !== mutationGeneration ||
        key !== workspace.sessionKey ||
        token !== auth.token
      )
        return false;
      await load(true);
      return true;
    } catch (reason) {
      if (revision === mutationGeneration) error.value = message(reason);
      return false;
    } finally {
      if (revision === mutationGeneration) busy.value = false;
    }
  }
  async function remove(entry: JournalItem) {
    if (!ready.value || busy.value) return;
    const revision = ++mutationGeneration,
      key = workspace.sessionKey,
      token = auth.token;
    busy.value = true;
    error.value = "";
    try {
      if (remote.value) {
        if (entry.version === undefined)
          throw new Error("Missing entry version");
        await journalClient.delete("/journal/" + entry.id, {
          params: { version: entry.version },
          headers: headers(),
        });
      } else if (
        !(await workspace.change((d) => {
          d.journal = d.journal.filter((e) => e.id !== entry.id);
        }))
      )
        throw new Error("Device write failed");
      if (
        revision === mutationGeneration &&
        key === workspace.sessionKey &&
        token === auth.token
      )
        await load(true);
    } catch (reason) {
      if (revision === mutationGeneration) error.value = message(reason);
    } finally {
      if (revision === mutationGeneration) busy.value = false;
    }
  }
  async function loadSummary(year: number) {
    const revision = ++summaryGeneration,
      key = workspace.sessionKey,
      token = auth.token;
    summary.value = null;
    summaryError.value = "";
    if (!remote.value || !ready.value) return;
    summaryLoading.value = true;
    try {
      const response = await journalClient.get("/journal/summary", {
        params: { year },
        headers: headers(),
      });
      if (
        revision === summaryGeneration &&
        key === workspace.sessionKey &&
        token === auth.token
      )
        summary.value = response.data.data;
    } catch {
      if (revision === summaryGeneration)
        summaryError.value =
          "Annual journal statistics could not load. Please retry.";
    } finally {
      if (revision === summaryGeneration) summaryLoading.value = false;
    }
  }
  return {
    remote,
    ready,
    entries,
    loading,
    busy,
    error,
    hasMore,
    summary,
    summaryLoading,
    summaryError,
    load,
    save,
    remove,
    loadSummary,
  };
});
