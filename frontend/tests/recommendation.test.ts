import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { recommend } from "../src/utils/platform";
import {
  useWorkspaceStore,
  workspaceClient,
  blankWorkspace,
} from "../src/stores/workspace";
import type { Game } from "../src/types";
const game = (slug: string, genre = "RPG") =>
  ({
    id: slug,
    slug,
    title: slug,
    genres: [genre],
    platforms: ["PC"],
    score: 80,
    status: "released",
  }) as Game;
const feedback = (
  choice: "interested" | "not-interested" | "less-like",
  title: string,
  genres = ["RPG"],
) => ({ choice, title, genres, at: "2026-11-03T10:00:00.000Z" });
test("recommendations honor explicit choices, reject duplicate titles and skip unseen-page exclusions", () => {
  const a = game("steam-1"),
    b = game("steam-2"),
    c = game("steam-3", "Strategy");
  const preferences = {
    genres: [],
    platforms: ["PC"],
    recommendationFeedback: {
      "steam-1": feedback("not-interested", a.title),
      "steam-3": feedback("interested", c.title, ["Strategy"]),
    },
  };
  const rows = recommend(
    [a, b, c, { ...a, slug: "gog-1" }],
    [],
    preferences,
    8,
    new Set(["steam-2"]),
  );
  assert.deepEqual(
    rows.map((r) => r.game.slug),
    ["steam-3"],
  );
  assert.match(rows[0].reason, /marked/);
  assert.equal(
    recommend([{ ...c, status: "upcoming" }], [], preferences).length,
    0,
  );
});
test("ranking is deterministic, considers saved activity and can diversify otherwise tied candidates", () => {
  const candidates = [
    game("steam-a"),
    game("steam-b"),
    game("steam-c", "Strategy"),
  ];
  const first = recommend(candidates, [], { genres: [], platforms: [] }, 3);
  assert.deepEqual(
    first.map((r) => r.game.slug),
    ["steam-a", "steam-c", "steam-b"],
  );
  assert.deepEqual(
    recommend(candidates, [], { genres: [], platforms: [] }, 3),
    first,
  );
  const less = {
    genres: [],
    platforms: [],
    recommendationFeedback: { "steam-hidden": feedback("less-like", "Hidden") },
  };
  assert.equal(recommend(candidates, [], less)[0].game.slug, "steam-c");
  assert.equal(
    recommend(
      Array.from({ length: 600 }, (_, i) => game("steam-" + i)),
      [],
      { genres: [], platforms: [] },
      100,
    ).length,
    24,
  );
});
const saved = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => saved.set(k, v),
    removeItem: (k: string) => saved.delete(k),
  },
  configurable: true,
});
test("feedback persists in the correct account, imports explicitly and retains the separate device backup", async () => {
  saved.clear();
  setActivePinia(createPinia());
  const ws = useWorkspaceStore();
  await ws.connect(null, null);
  await ws.feedback(game("steam-1"), "interested");
  const backup = saved.get("gamevault_workspace_v1");
  const rows: any = {
    alice: { data: blankWorkspace(), version: 0 },
    bob: { data: blankWorkspace(), version: 0 },
  };
  rows.alice.data.preferences.recommendationFeedback = {
    "steam-1": feedback("not-interested", "steam-1"),
  };
  workspaceClient.defaults.adapter = async (config) => {
    const who = String(config.headers.Authorization).includes("alice")
      ? "alice"
      : "bob";
    if (config.method === "put") {
      const body = JSON.parse(config.data);
      assert.equal(body.version, rows[who].version);
      rows[who] = { data: body.data, version: body.version + 1 };
    }
    return {
      data: structuredClone(rows[who]),
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  await ws.connect("alice-token", "alice");
  await ws.importDevice();
  assert.equal(
    ws.data.preferences.recommendationFeedback?.["steam-1"].choice,
    "not-interested",
  );
  await ws.feedback(game("steam-2"), "less-like");
  assert.equal(
    rows.alice.data.preferences.recommendationFeedback["steam-2"].choice,
    "less-like",
  );
  await ws.connect("bob-token", "bob");
  assert.equal(ws.data.preferences.recommendationFeedback, undefined);
  await ws.connect(null, null);
  assert.equal(
    ws.data.preferences.recommendationFeedback?.["steam-1"].choice,
    "interested",
  );
  assert.equal(
    ws.data.preferences.recommendationFeedback?.["steam-2"],
    undefined,
  );
  assert.equal(saved.get("gamevault_workspace_v1"), backup);
});
