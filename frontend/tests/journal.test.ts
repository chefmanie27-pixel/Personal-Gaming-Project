import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { AxiosError } from "axios";
import { useAuthStore } from "../src/stores/auth";
import {
  blankWorkspace,
  useWorkspaceStore,
  workspaceClient,
  type JournalItem,
} from "../src/stores/workspace";
import { useJournalStore, journalClient } from "../src/stores/journal";
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
  configurable: true,
});
const item = (n: number) =>
  ({
    id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"),
    game: {
      id: "steam-123",
      slug: "steam-123",
      title: "Fixture",
      store: "Steam",
      genres: ["RPG"],
      platforms: ["PC"],
    },
    date: "2026-01-01",
    kind: "session",
    minutes: 60,
    notes: "Private " + n,
    progress: "",
    tags: [],
    spoiler: false,
    rating: null,
    version: 0,
  }) as JournalItem;
async function account() {
  storage.clear();
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.token = "alice-token";
  auth.user = { id: "alice", email: "alice@example.invalid", role: "USER" };
  const workspace = useWorkspaceStore();
  workspaceClient.defaults.adapter = async (config) => ({
    data: { data: blankWorkspace(), version: 0, journalMode: "normalized" },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });
  await workspace.connect(auth.token, "alice");
  const journal = useJournalStore();
  await nextTick();
  return { auth, workspace, journal };
}
test("normalized journal appends distinct pages, retains filters and rejects uncertain stale saves", async () => {
  const { journal, workspace } = await account();
  const queries: any[] = [];
  journalClient.defaults.adapter = async (config) => {
    queries.push(config.params);
    return {
      data: config.params.cursor
        ? {
            data: [item(1), item(3)],
            meta: { hasMore: false, nextCursor: null },
          }
        : {
            data: [item(1), item(2)],
            meta: {
              hasMore: true,
              nextCursor: { date: "2026-01-01", id: item(2).id },
            },
          },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  await journal.load(true, { q: "Fixture", kind: "session" });
  await journal.load(false);
  assert.equal(journal.entries.length, 3);
  assert.equal(queries[1].q, "Fixture");
  assert.ok(queries[1].cursor);
  assert.equal(workspace.data.journal.length, 0);
  journalClient.defaults.adapter = async (config) => {
    throw new AxiosError("Conflict", "ERR_BAD_REQUEST", config, undefined, {
      data: {},
      status: 409,
      statusText: "Conflict",
      headers: {},
      config,
    });
  };
  assert.equal(
    await journal.save({ ...item(1), notes: "Changed" }, true),
    false,
  );
  assert.match(journal.error, /another session/);
  assert.equal(journal.entries[0].notes, "Private 1");
});
test("journal results and annual summaries cannot cross sessions or replace a newer selected year", async () => {
  const { journal, workspace, auth } = await account();
  const resolvers = new Map<number, () => void>();
  journalClient.defaults.adapter = (config) =>
    new Promise((resolve) => {
      const year = Number(config.params.year);
      resolvers.set(year, () =>
        resolve({
          data: {
            data: {
              minutes: year,
              monthly: Array(12).fill(0),
              genres: [],
              mostPlayed: null,
              highestRated: null,
            },
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        }),
      );
    });
  const older = journal.loadSummary(2025),
    newer = journal.loadSummary(2026);
  resolvers.get(2026)!();
  await newer;
  resolvers.get(2025)!();
  await older;
  assert.equal(journal.summary?.minutes, 2026);
  let release = () => {};
  journalClient.defaults.adapter = (config) =>
    new Promise((resolve) => {
      release = () =>
        resolve({
          data: { data: [item(1)], meta: { hasMore: false, nextCursor: null } },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        });
    });
  const loading = journal.load();
  auth.token = null;
  auth.user = null;
  await workspace.connect(null, null);
  await nextTick();
  release();
  await loading;
  assert.equal(journal.entries.length, 0);
});
test("explicit normalized journal import keeps the guest backup and sends no journal history in metadata writes", async () => {
  storage.clear();
  setActivePinia(createPinia());
  const workspace = useWorkspaceStore();
  await workspace.connect(null, null);
  await workspace.change((d) => {
    d.journal = [item(1), item(2)];
  });
  const backup = storage.get("gamevault_workspace_v1");
  const rows = new Map<string, JournalItem>([
    [item(1).id, { ...item(1), notes: "Account wins" }],
  ]);
  let data = blankWorkspace(),
    version = 0;
  workspaceClient.defaults.adapter = async (config) => {
    if (config.url === "/journal/import") {
      const payload = JSON.parse(config.data);
      for (const entry of payload.entries) {
        assert.equal("version" in entry, false);
        if (!rows.has(entry.id)) rows.set(entry.id, entry);
      }
      return {
        data: { success: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    }
    if (config.method === "put") {
      const payload = JSON.parse(config.data);
      assert.equal(payload.data.journal.length, 0);
      data = payload.data;
      version++;
    }
    return {
      data: { data, version, journalMode: "normalized" },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  await workspace.connect("alice", "alice");
  assert.equal(await workspace.importDevice(), true);
  assert.equal(rows.size, 2);
  assert.equal(rows.get(item(1).id)?.notes, "Account wins");
  assert.equal(storage.get("gamevault_workspace_v1"), backup);
});
