import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recommend,
  randomEntry,
  exactReleaseDate,
  annualStats,
} from "../src/utils/platform";
import {
  blankWorkspace,
  useWorkspaceStore,
  workspaceClient,
} from "../src/stores/workspace";
import { createPinia, setActivePinia } from "pinia";
import type { Game } from "../src/types";
import type { LibraryEntry } from "../src/stores/library";
const game = (slug: string, genres = ["RPG"]) =>
  ({
    slug,
    id: slug,
    title: slug,
    genres,
    platforms: ["PC"],
    score: null,
    status: "released",
  }) as Game;
const entry = (slug: string) =>
  ({
    game: game(slug),
    status: "Completed",
    favorite: true,
    rating: 9,
    hours: 50,
    notes: "",
    addedAt: "2025-01-01",
  }) as LibraryEntry;
test("recommendations exclude owned games, prevent duplicates, explain signals and respect preferred platforms", () => {
  const library = [entry("steam-owned")];
  const candidates = [
    game("steam-owned"),
    game("steam-rpg"),
    game("steam-rpg"),
    game("steam-action", ["Action"]),
    { ...game("steam-console"), platforms: ["Xbox"] },
  ];
  const results = recommend(candidates, library, {
    genres: ["RPG"],
    platforms: ["PC"],
  });
  assert.equal(results[0].game.slug, "steam-rpg");
  assert.match(results[0].reason, /RPG/);
  assert.equal(
    results.some((r) => r.game.slug === "steam-console"),
    false,
  );
  assert.equal(results.length, 2);
  assert.equal(
    recommend([game("steam-new")], [], { genres: [], platforms: [] }).length,
    1,
  );
});
test("picker remains inside filtered input, handles empty input and avoids immediate repetition", () => {
  const entries = [entry("steam-a"), entry("steam-b")];
  assert.equal(randomEntry(entries, "steam-a", () => 0)?.game.slug, "steam-b");
  assert.equal(randomEntry([], undefined), undefined);
  assert.equal(randomEntry([entries[0]], "steam-a")?.game.slug, "steam-a");
});
test("release dates distinguish exact days from quarter, year-only and unknown announcements", () => {
  assert.equal(exactReleaseDate("2027-02-28"), "2027-02-28");
  assert.equal(exactReleaseDate("28 Feb, 2027"), "2027-02-28");
  for (const date of [
    "2027",
    "Q4 2027",
    "Coming soon",
    "2027-02-30",
    "31 Dec, 9998",
    "29 Feb, 2104",
  ])
    assert.equal(exactReleaseDate(date), null);
});
test("annual analytics use explicit dates and sessions, never lifetime library hours", () => {
  const workspace = blankWorkspace();
  workspace.metadata["steam-a"] = {
    completedAt: "2026-12-31",
    priority: "High",
    collectionIds: [],
  };
  workspace.metadata["steam-b"] = {
    completedAt: "2027-01-01",
    priority: "Normal",
    collectionIds: [],
  };
  workspace.journal = [
    {
      id: "1",
      game: game("steam-a"),
      date: "2026-01-01",
      kind: "session",
      minutes: 90,
      notes: "Session",
      progress: "",
      tags: [],
      spoiler: false,
      rating: null,
    },
  ];
  const stats = annualStats(
    [entry("steam-a"), entry("steam-b"), entry("steam-undated")],
    workspace,
    2026,
  );
  assert.equal(stats.completed, 1);
  assert.equal(stats.minutes, 90);
  assert.equal(stats.monthly[11].completed, 1);
  assert.equal(stats.undatedCompletions, 1);
  assert.equal(annualStats([], blankWorkspace(), 2026).minutes, 0);
});
test("private workspace protects guest data and rejects uncertain account saves", async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    configurable: true,
  });
  setActivePinia(createPinia());
  const store = useWorkspaceStore();
  await store.connect(null, null);
  await store.change((d) => (d.profile.name = "Guest"));
  const backup = storage.get("gamevault_workspace_v1");
  workspaceClient.defaults.adapter = async (config) => ({
    data: { data: blankWorkspace(), version: 0 },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });
  await store.connect("token", "alice");
  assert.equal(store.data.profile.name, "");
  workspaceClient.defaults.adapter = async () => {
    throw new Error("Offline");
  };
  assert.equal(await store.change((d) => (d.profile.name = "Lost")), false);
  assert.equal(store.data.profile.name, "");
  assert.ok(store.error);
  assert.equal(storage.get("gamevault_workspace_v1"), backup);
  await store.connect(null, null);
  assert.equal(store.data.profile.name, "Guest");
});

test("late private workspace reads cannot leak into a signed-out session", async () => {
  setActivePinia(createPinia());
  const store = useWorkspaceStore();
  let release: () => void = () => {};
  workspaceClient.defaults.adapter = (config) =>
    new Promise((resolve) => {
      release = () =>
        resolve({
          data: {
            data: {
              ...blankWorkspace(),
              profile: { name: "Private Alice", bio: "Personal" },
            },
            version: 0,
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        });
    });
  const loading = store.connect("alice-token", "alice");
  await store.connect(null, null);
  release();
  await loading;
  assert.equal(store.sessionKey, "guest");
  assert.notEqual(store.data.profile.name, "Private Alice");
});
