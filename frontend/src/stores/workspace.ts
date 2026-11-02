import { computed, ref } from "vue";
import { defineStore } from "pinia";
import axios from "axios";
import type { Game } from "../types";
export interface GameMeta {
  completedAt: string | null;
  priority: "Low" | "Normal" | "High";
  collectionIds: string[];
}
export interface JournalItem {
  version?: number;
  id: string;
  game: Game;
  date: string;
  kind: "session" | "review";
  minutes: number;
  notes: string;
  progress: string;
  tags: string[];
  spoiler: boolean;
  rating: number | null;
}
export interface Workspace {
  profile: { name: string; bio: string };
  preferences: {
    genres: string[];
    platforms: string[];
    libraryView?: "grid" | "list";
    librarySort?: "added" | "title" | "rating" | "priority";
  };
  collections: { id: string; name: string }[];
  metadata: Record<string, GameMeta>;
  journal: JournalItem[];
  watches: { game: Game; followedAt: string; previousDate?: string }[];
}
export const blankWorkspace = (): Workspace => ({
  profile: { name: "", bio: "" },
  preferences: { genres: [], platforms: [] },
  collections: [],
  metadata: {},
  journal: [],
  watches: [],
});
export const workspaceClient = axios.create({
  baseURL: import.meta.env?.VITE_API_URL ?? "http://localhost:3000/api",
  timeout: 20000,
});
const key = "gamevault_workspace_v1";
export const useWorkspaceStore = defineStore("workspace", () => {
  const data = ref<Workspace>(blankWorkspace()),
    ready = ref(false),
    busy = ref(false),
    error = ref(""),
    account = ref(false),
    notice = ref("");
  const journalMode = ref<"legacy" | "normalized">("legacy");
  const importing = ref(false);
  const sessionKey = ref("guest");
  let token: string | null = null,
    version = 0,
    generation = 0;
  let queue = Promise.resolve();
  function device() {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "null");
      if (!raw) return blankWorkspace();
      if (
        !Array.isArray(raw.collections) ||
        !Array.isArray(raw.journal) ||
        !Array.isArray(raw.watches) ||
        !raw.preferences ||
        !raw.metadata
      )
        throw new Error();
      return { ...blankWorkspace(), ...raw } as Workspace;
    } catch {
      error.value =
        "Device workspace could not be read. Its saved data has not been overwritten.";
      return blankWorkspace();
    }
  }
  const scope = computed(() =>
    account.value
      ? "Private workspace saved to your account."
      : "Saved on this device only. Sign in for account persistence.",
  );
  async function connect(nextToken: string | null, userId: string | null) {
    const current = ++generation;
    token = nextToken;
    sessionKey.value = userId ?? (nextToken ? "pending" : "guest");
    notice.value = "";
    journalMode.value = "legacy";
    importing.value = false;
    account.value = !!nextToken;
    data.value = blankWorkspace();
    ready.value = false;
    busy.value = false;
    error.value = "";
    queue = Promise.resolve();
    if (!nextToken) {
      data.value = device();
      ready.value = true;
      return;
    }
    if (!userId) return;
    try {
      const response = await workspaceClient.get("/workspace", {
        headers: { Authorization: "Bearer " + nextToken },
      });
      if (current === generation) {
        data.value = response.data.data;
        journalMode.value = response.data.journalMode ?? "legacy";
        version = response.data.version;
        ready.value = true;
      }
    } catch {
      if (current === generation)
        error.value =
          "Private workspace could not load. Reload before editing.";
    }
  }
  function change(edit: (draft: Workspace) => void) {
    notice.value = "";
    if (!ready.value || error.value) {
      error.value = "Reload your workspace before editing.";
      return Promise.resolve(false);
    }
    const current = generation,
      auth = token;
    let success = false;
    queue = queue.then(async () => {
      if (current !== generation || error.value) return;
      busy.value = true;
      try {
        const draft = JSON.parse(JSON.stringify(data.value)) as Workspace;
        edit(draft);
        if (
          new TextEncoder().encode(JSON.stringify(draft)).length >
          4 * 1024 * 1024
        )
          throw new Error("Workspace exceeds the 4 MiB limit");
        if (auth) {
          const response = await workspaceClient.put(
            "/workspace",
            { version, data: draft },
            { headers: { Authorization: "Bearer " + auth } },
          );
          if (current !== generation) return;
          data.value = response.data.data;
          version = response.data.version;
        } else {
          localStorage.setItem(key, JSON.stringify(draft));
          data.value = draft;
        }
        success = true;
        notice.value = "Workspace saved.";
      } catch (reason) {
        if (current === generation)
          error.value =
            axios.isAxiosError(reason) && reason.response?.status === 409
              ? "Another session changed your workspace. Reload before retrying."
              : "Could not confirm the workspace save. Reload before retrying; the device backup is unchanged.";
      } finally {
        if (current === generation) busy.value = false;
      }
    });
    return queue.then(() => success);
  }
  function meta(slug: string): GameMeta {
    return (
      data.value.metadata[slug] ?? {
        completedAt: null,
        priority: "Normal",
        collectionIds: [],
      }
    );
  }
  function setMeta(slug: string, patch: Partial<GameMeta>) {
    return change((d) => {
      d.metadata[slug] = { ...meta(slug), ...patch };
    });
  }
  function toggleWatch(game: Game) {
    return change((d) => {
      const index = d.watches.findIndex((w) => w.game.slug === game.slug);
      if (index >= 0) d.watches.splice(index, 1);
      else d.watches.push({ game, followedAt: new Date().toISOString() });
    });
  }
  async function importDevice() {
    if (importing.value) return false;
    const saved = device();
    if (journalMode.value === "normalized" && token) {
      const current = generation,
        auth = token;
      importing.value = true;
      try {
        for (let start = 0; start < saved.journal.length; start += 25) {
          if (current !== generation) return false;
          await workspaceClient.post(
            "/journal/import",
            {
              entries: saved.journal
                .slice(start, start + 25)
                .map(({ version, ...entry }) => entry),
            },
            { headers: { Authorization: "Bearer " + auth } },
          );
        }
        if (current !== generation) return false;
      } catch {
        if (current === generation)
          error.value =
            "Journal import could not finish. Your device backup is kept; reload before retrying.";
        return false;
      } finally {
        if (current === generation) importing.value = false;
      }
    }
    return change((d) => {
      d.collections = [
        ...new Map(
          [...saved.collections, ...d.collections].map((c) => [c.id, c]),
        ).values(),
      ];
      d.metadata = { ...saved.metadata, ...d.metadata };
      d.journal =
        journalMode.value === "normalized"
          ? []
          : [
              ...new Map(
                [...saved.journal, ...d.journal].map((e) => [e.id, e]),
              ).values(),
            ];
      d.watches = [
        ...new Map(
          [...saved.watches, ...d.watches].map((w) => [w.game.slug, w]),
        ).values(),
      ];
    });
  }
  return {
    data,
    sessionKey,
    journalMode,
    importing,
    ready,
    busy,
    error,
    account,
    notice,
    scope,
    connect,
    change,
    meta,
    setMeta,
    toggleWatch,
    importDevice,
  };
});
