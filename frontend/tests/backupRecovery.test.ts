import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { useLibraryStore } from "../src/stores/library";
import { libraryClient } from "../src/services/library";
import { blankWorkspace, useWorkspaceStore, workspaceClient } from "../src/stores/workspace";
import type { Game } from "../src/types";
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
const game = { id: "steam-10", slug: "steam-10", title: "Fixture", genres: ["RPG"], platforms: ["PC"], store: "Steam" } as Game;
const entry = { game, status: "Want to Play", favorite: false, rating: null, hours: 0, notes: "Private device note", addedAt: "2026-01-01T00:00:00.000Z" };
const response = (config: any, data: any) => ({ config, data, status: 200, statusText: "OK", headers: {} });
const flush = () => new Promise(r => setTimeout(r, 0));
test("unreadable and partially invalid device libraries cannot be silently overwritten by edits", () => {
  for (const raw of ["invalid JSON", "{}", JSON.stringify([entry, { ...entry, game: { ...game, genres: [null] } }])]) {
    storage.clear(); storage.set("gamevault_library_v1", raw); setActivePinia(createPinia());
    const library = useLibraryStore(); assert.ok(library.storageError);
    library.add(game); library.favorite(game); library.bulkStatus([game.slug], "Completed"); library.remove(game.slug);
    assert.equal(storage.get("gamevault_library_v1"), raw, "preserve original bytes after attempted edits");
    assert.equal(library.entries.length, 0);
  }
});
test("a malformed device library starts no account import and leaves account editing available", async () => {
  storage.clear(); storage.set("gamevault_library_v1", JSON.stringify([entry, { hours: -1 }])); setActivePinia(createPinia());
  let writes = 0;
  libraryClient.defaults.adapter = async c => { if (c.method === "post") writes++; return response(c, { data: [] }); };
  const library = useLibraryStore(); await library.connect("alice-token", "alice"); await library.importDevice();
  assert.equal(writes, 0); assert.equal(library.syncState, "ready"); assert.ok(library.storageError);
});
test("workspace import cannot send journal records before account readiness or after an uncertain save", async () => {
  for (const unavailable of ["loading", "error"]) {
    storage.clear(); const saved = blankWorkspace(); saved.journal = [{ id: "device-row", game, date: "2026-01-01", kind: "session", minutes: 60, notes: "Private", progress: "", tags: [], spoiler: false, rating: null }];
    storage.set("gamevault_workspace_v1", JSON.stringify(saved)); setActivePinia(createPinia()); let posts = 0;
    workspaceClient.defaults.adapter = async c => { if (c.method === "post") posts++; return response(c, { data: blankWorkspace(), version: 0, journalMode: "normalized" }); };
    const workspace = useWorkspaceStore(); await workspace.connect("alice-token", "alice");
    if (unavailable === "loading") workspace.ready = false; else workspace.error = "Reload before retrying";
    assert.equal(await workspace.importDevice(), false); assert.equal(posts, 0);
    assert.equal(storage.get("gamevault_workspace_v1"), JSON.stringify(saved));
  }
});
test("workspace import stays pending through metadata persistence and blocks duplicate starts", async () => {
  storage.clear(); storage.set("gamevault_workspace_v1", JSON.stringify(blankWorkspace())); setActivePinia(createPinia());
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let writes = 0;
  workspaceClient.defaults.adapter = async c => { if (c.method === "put") { writes++; await gate; } return response(c, { data: blankWorkspace(), version: writes, journalMode: "legacy" }); };
  const workspace = useWorkspaceStore(); await workspace.connect("alice-token", "alice");
  const first = workspace.importDevice(), second = workspace.importDevice();
  try { await flush(); assert.equal(workspace.importing, true); assert.equal(writes, 1); }
  finally { release(); await Promise.all([first, second]); }
  assert.equal(workspace.importing, false);
});

test("a partially committed library import preserves its source and recovers by reload and idempotent retry", async () => {
  storage.clear(); const rows = Array.from({ length: 26 }, (_, i) => ({ ...entry, game: { ...game, id: "steam-" + i, slug: "steam-" + i } }));
  const raw = JSON.stringify(rows); storage.set("gamevault_library_v1", raw); setActivePinia(createPinia());
  const remote = new Map<string, any>([["steam-0", { ...rows[0], notes: "Account wins" }]]); let failSecond = true;
  libraryClient.defaults.adapter = async c => {
    if (c.method === "post") {
      const batch = JSON.parse(c.data).entries;
      if (batch[0].game.slug === "steam-25" && failSecond) throw new Error("uncertain batch");
      for (const row of batch) if (!remote.has(row.game.slug)) remote.set(row.game.slug, row);
    }
    return response(c, { data: [...remote.values()] });
  };
  const library = useLibraryStore(); await library.connect("alice-token", "alice"); await library.importDevice();
  assert.equal(library.syncState, "error"); assert.equal(library.pending, 0); assert.equal(remote.size, 25); assert.equal(storage.get("gamevault_library_v1"), raw);
  failSecond = false; await library.refresh(); await library.importDevice();
  assert.equal(library.syncState, "ready"); assert.equal(library.entries.length, 26); assert.equal(library.find("steam-0")?.notes, "Account wins"); assert.equal(storage.get("gamevault_library_v1"), raw);
});
test("device data can be downloaded and reread without changing an active account library", async () => {
  storage.clear(); storage.set("gamevault_library_v1", "invalid original"); setActivePinia(createPinia());
  libraryClient.defaults.adapter = async c => response(c, { data: [{ ...entry, notes: "Account note" }] });
  const library = useLibraryStore(); await library.connect("alice-token", "alice");
  assert.equal(library.deviceBackup(), "invalid original"); assert.equal(library.deviceReadOnly, false);
  storage.set("gamevault_library_v1", JSON.stringify([entry])); library.reloadDevice();
  assert.equal(library.storageError, ""); assert.equal(library.deviceUnreadable, false); assert.equal(library.find(game.slug)?.notes, "Account note");
  await library.connect(null, null); assert.equal(library.find(game.slug)?.notes, "Private device note");
});

test("an old workspace import cannot send another batch or clear a new account import", async () => {
  storage.clear(); const saved = blankWorkspace();
  saved.journal = Array.from({ length: 26 }, (_, i) => ({ id: "device-" + i, game, date: "2026-01-01", kind: "session", minutes: 60, notes: "Private", progress: "", tags: [], spoiler: false, rating: null }));
  const raw = JSON.stringify(saved); storage.set("gamevault_workspace_v1", raw); setActivePinia(createPinia());
  let releaseOld!: () => void, releaseNew!: () => void;
  const oldGate = new Promise<void>(r => { releaseOld = r; }), newGate = new Promise<void>(r => { releaseNew = r; });
  const posts: string[] = [];
  workspaceClient.defaults.adapter = async c => {
    if (c.method === "post") {
      const token = String(c.headers.Authorization); posts.push(token);
      if (JSON.parse(c.data).entries.length === 25) await (token === "Bearer alice" ? oldGate : newGate);
    }
    return response(c, { data: blankWorkspace(), version: 0, journalMode: "normalized" });
  };
  const workspace = useWorkspaceStore(); await workspace.connect("alice", "alice");
  const first = workspace.importDevice(); await flush(); await workspace.connect("bob", "bob");
  const second = workspace.importDevice(); await flush();
  try {
    releaseOld(); assert.equal(await first, false); assert.equal(workspace.importing, true);
    assert.deepEqual(posts, ["Bearer alice", "Bearer bob"]);
    releaseNew(); assert.equal(await second, true); assert.equal(workspace.importing, false);
    assert.deepEqual(posts, ["Bearer alice", "Bearer bob", "Bearer bob"]); assert.equal(storage.get("gamevault_workspace_v1"), raw);
  } finally { releaseOld(); releaseNew(); }
});
