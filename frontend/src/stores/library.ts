import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  loadLibrary,
  bulkLibraryStatus,
  addLibraryEntry,
  patchLibraryEntry,
  deleteLibraryEntry,
  importLibraryEntries,
} from "../services/library";
import type { Game } from "../types";
export const statuses = [
  "Want to Play",
  "Currently Playing",
  "Completed",
  "On Hold",
  "Dropped",
] as const;
export type PlayingStatus = (typeof statuses)[number];
export interface LibraryEntry {
  game: Game;
  status: PlayingStatus;
  favorite: boolean;
  rating: number | null;
  hours: number;
  notes: string;
  addedAt: string;
}
const key = "gamevault_library_v1";
export const useLibraryStore = defineStore("library", () => {
  const entries = ref<LibraryEntry[]>([]);
  const message = ref("");
  const storageError = ref("");
  const deviceUnreadable = ref(false);
  const deviceReadOnly = computed(() => syncState.value === "local" && deviceUnreadable.value);
  const accountId = ref<string | null>(null);
  const syncState = ref<"local" | "loading" | "ready" | "error">("local");
  const syncError = ref("");
  const pending = ref(0);
  const deviceCount = ref(0);
  let accountToken: string | null = null;
  let generation = 0;
  let queue: Promise<void> = Promise.resolve();
  const scopeDescription = computed(() =>
    syncState.value === "loading"
      ? "Loading your account library; device data is unchanged."
      : accountId.value
        ? syncState.value === "ready"
          ? "Saved to your account. Your device collection remains separate."
          : "Account library is unavailable until it finishes loading. Your device collection is unchanged."
        : "Saved on this browser only, separate from your account wishlist.",
  );
  function readDevice(): LibraryEntry[] {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (!Array.isArray(saved) || !saved.every((e): e is LibraryEntry =>
        !!e && typeof e.game?.slug === "string" && e.game.slug.length > 0 &&
        typeof e.game.title === "string" &&
        Array.isArray(e.game.genres) && e.game.genres.every((g: unknown) => typeof g === "string") &&
        Array.isArray(e.game.platforms) && e.game.platforms.every((g: unknown) => typeof g === "string") &&
        typeof e.game.store === "string" && statuses.includes(e.status) && typeof e.favorite === "boolean" &&
        (e.rating === null || (Number.isFinite(e.rating) && e.rating >= 0 && e.rating <= 10)) &&
        Number.isFinite(e.hours) && e.hours >= 0 && typeof e.notes === "string" && typeof e.addedAt === "string"
      )) throw new Error("Invalid saved library");
      if (deviceUnreadable.value) storageError.value = "";
      deviceUnreadable.value = false;
      return saved;
    } catch {
      deviceUnreadable.value = true;
      storageError.value = "Your device collection could not be read completely. Its original data is preserved; device edits and import are blocked until it can be read.";
      return [];
    }
  }
  function deviceBackup(): string | null {
    try { return localStorage.getItem(key); }
    catch { storageError.value = "Device storage could not be accessed. No data was changed."; return null; }
  }
  function reloadDevice() {
    const saved = readDevice();
    deviceCount.value = saved.length;
    if (!accountToken) entries.value = saved;
  }
  entries.value = readDevice();
  async function connect(token: string | null, userId: string | null) {
    const current = ++generation;
    accountToken = token;
    accountId.value = userId;
    syncError.value = "";
    pending.value = 0;
    queue = Promise.resolve();
    const device = readDevice();
    deviceCount.value = device.length;
    entries.value = token ? [] : device;
    syncState.value = token ? "loading" : "local";
    if (!token || !userId) return;
    try {
      const saved = await loadLibrary(token);
      if (current === generation) {
        entries.value = saved;
        syncState.value = "ready";
      }
    } catch {
      if (current === generation) {
        syncState.value = "error";
        syncError.value =
          "Your account library could not be loaded. Retry before editing; device data has not been changed.";
      }
    }
  }
  function refresh() {
    return connect(accountToken, accountId.value);
  }
  function enqueue(
    work: (token: string, current: () => boolean) => Promise<void>,
  ) {
    if (!accountToken || syncState.value !== "ready") {
      syncError.value =
        "Wait for the account library to load, or retry loading it.";
      return;
    }
    const token = accountToken,
      revision = generation;
    pending.value++;
    const current = () => revision === generation;
    queue = queue.then(async () => {
      if (!current()) return;
      if (syncState.value !== "ready") {
        pending.value--;
        return;
      }
      try {
        await work(token, current);
        if (current()) {
          syncError.value = "";
          message.value = "Saved to your account library.";
        }
      } catch {
        if (current()) {
          syncState.value = "error";
          syncError.value =
            "The account change could not be confirmed. Reload the library before retrying; your device backup is unchanged.";
        }
      } finally {
        if (current()) pending.value--;
      }
    });
    return queue;
  }
  function replace(entry: LibraryEntry) {
    const index = entries.value.findIndex(
      (e) => e.game.slug === entry.game.slug,
    );
    if (index < 0) entries.value.push(entry);
    else entries.value[index] = entry;
  }
  function fresh(game: Game): LibraryEntry {
    return {
      game,
      status: "Want to Play",
      favorite: false,
      rating: null,
      hours: 0,
      notes: "",
      addedAt: new Date().toISOString(),
    };
  }
  function importDevice() {
    if (!accountToken || syncState.value !== "ready" || pending.value) return;
    const device = readDevice();
    deviceCount.value = device.length;
    if (deviceUnreadable.value) return;
    return enqueue(async (token, current) => {
      for (let i = 0; i < device.length; i += 25) {
        if (!current()) return;
        await importLibraryEntries(token, device.slice(i, i + 25));
      }
      if (!current()) return;
      const saved = await loadLibrary(token);
      if (current()) entries.value = saved;
    });
  }
  function persist(text: string) {
    if (!accountToken && deviceUnreadable.value) return;
    try {
      localStorage.setItem(key, JSON.stringify(entries.value));
      storageError.value = "";
      message.value = text;
    } catch {
      storageError.value =
        "Device storage is unavailable or full. Changes are only kept until this page closes.";
    }
  }
  const find = (slug: string) =>
    entries.value.find((e) => e.game.slug === slug);
  function add(game: Game) {
    if (!accountToken && deviceUnreadable.value) return;
    if (accountToken)
      return enqueue(async (token, current) => {
        const saved = await addLibraryEntry(token, fresh(game));
        if (current()) replace(saved);
      });
    if (!find(game.slug)) {
      entries.value.push({
        game,
        status: "Want to Play",
        favorite: false,
        rating: null,
        hours: 0,
        notes: "",
        addedAt: new Date().toISOString(),
      });
      persist("Added to your device library.");
    }
  }
  function update(
    slug: string,
    patch: Partial<
      Pick<LibraryEntry, "status" | "favorite" | "rating" | "hours" | "notes">
    >,
  ) {
    if (!accountToken && deviceUnreadable.value) return;
    const entry = find(slug);
    if (!entry) return;
    if (patch.status !== undefined && !statuses.includes(patch.status)) return;
    if (
      patch.rating !== undefined &&
      patch.rating !== null &&
      (!Number.isFinite(patch.rating) || patch.rating < 0 || patch.rating > 10)
    )
      return;
    if (
      patch.hours !== undefined &&
      (!Number.isFinite(patch.hours) || patch.hours < 0)
    )
      return;
    if (accountToken)
      return enqueue(async (token, current) => {
        const saved = await patchLibraryEntry(token, slug, patch);
        if (current()) replace(saved);
      });
    Object.assign(entry, patch);
    persist("Library updated.");
  }
  function favorite(game: Game) {
    if (!accountToken && deviceUnreadable.value) return;
    if (accountToken)
      return enqueue(async (token, current) => {
        const entry = find(game.slug);
        const saved = entry
          ? await patchLibraryEntry(token, game.slug, {
              favorite: !entry.favorite,
            })
          : await addLibraryEntry(token, { ...fresh(game), favorite: true });
        if (current()) replace(saved);
      });
    add(game);
    const entry = find(game.slug)!;
    update(game.slug, { favorite: !entry.favorite });
  }
  function bulkStatus(slugs: string[], status: PlayingStatus) {
    if (!accountToken && deviceUnreadable.value) return;
    const selected = new Set(slugs);
    if (
      !selected.size ||
      selected.size > 20 ||
      selected.size !== slugs.length ||
      !statuses.includes(status) ||
      slugs.some((s) => !find(s))
    )
      return;
    if (accountToken)
      return enqueue(async (token, current) => {
        const rows = await bulkLibraryStatus(token, slugs, status);
        if (current()) for (const row of rows) replace(row);
      });
    entries.value = entries.value.map((e) =>
      selected.has(e.game.slug) ? { ...e, status } : e,
    );
    persist("Updated selected game statuses.");
  }
  function remove(slug: string) {
    if (!accountToken && deviceUnreadable.value) return;
    if (accountToken)
      return enqueue(async (token, current) => {
        await deleteLibraryEntry(token, slug);
        if (current())
          entries.value = entries.value.filter((e) => e.game.slug !== slug);
      });
    entries.value = entries.value.filter((e) => e.game.slug !== slug);
    persist("Removed from your device library.");
  }
  const stats = computed(() => {
    const rated = entries.value.filter((e) => e.rating !== null);
    const genres = new Map<string, number>();
    for (const e of entries.value)
      for (const g of e.game.genres ?? [])
        genres.set(g, (genres.get(g) ?? 0) + 1);
    return {
      total: entries.value.length,
      completed: entries.value.filter((e) => e.status === "Completed").length,
      playing: entries.value.filter((e) => e.status === "Currently Playing")
        .length,
      backlog: entries.value.filter((e) => e.status === "Want to Play").length,
      hours: entries.value.reduce((sum, e) => sum + e.hours, 0),
      average: rated.length
        ? (rated.reduce((sum, e) => sum + e.rating!, 0) / rated.length).toFixed(
            1,
          )
        : null,
      genres: [...genres].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  });
  return {
    accountId,
    syncState,
    syncError,
    pending,
    deviceCount,
    scopeDescription,
    connect,
    refresh,
    importDevice,
    entries,
    message,
    storageError,
    deviceUnreadable,
    deviceReadOnly,
    deviceBackup,
    reloadDevice,
    find,
    add,
    update,
    bulkStatus,
    favorite,
    remove,
    stats,
  };
});
