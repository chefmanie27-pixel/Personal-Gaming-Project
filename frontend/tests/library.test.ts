import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { useLibraryStore } from "../src/stores/library";
import { releaseYear } from "../src/utils/dates";
import type { Game } from "../src/types";
const data = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  },
  configurable: true,
});
const game = {
  slug: "steam-10",
  title: "Test",
  genres: ["RPG"],
  platforms: ["PC"],
  store: "Steam",
} as Game;
test("collection deduplicates games, persists journal values, and computes real statistics", () => {
  data.clear();
  setActivePinia(createPinia());
  const library = useLibraryStore();
  library.add(game);
  library.add(game);
  library.favorite(game);
  library.update(game.slug, {
    status: "Completed",
    rating: 8.5,
    hours: 12,
    notes: "Journal",
  });
  assert.equal(library.entries.length, 1);
  assert.equal(library.stats.completed, 1);
  assert.equal(library.stats.average, "8.5");
  assert.equal(library.stats.hours, 12);
  library.update(game.slug, { rating: 11, hours: -2 });
  assert.equal(library.find(game.slug)?.rating, 8.5);
  setActivePinia(createPinia());
  const restored = useLibraryStore();
  assert.equal(restored.find(game.slug)?.notes, "Journal");
  assert.equal(restored.find(game.slug)?.favorite, true);
  restored.remove(game.slug);
  assert.equal(restored.stats.total, 0);
  assert.equal(restored.stats.average, null);
});
test("corrupt device storage is reported and not overwritten on load", () => {
  data.set("gamevault_library_v1", "invalid JSON");
  setActivePinia(createPinia());
  const library = useLibraryStore();
  assert.ok(library.storageError);
  assert.equal(data.get("gamevault_library_v1"), "invalid JSON");
});
test("release years support storefront human-readable and ISO dates", () => {
  assert.equal(releaseYear("10 Jan, 2025"), "2025");
  assert.equal(releaseYear("2024-06-10"), "2024");
  assert.equal(releaseYear("Coming soon"), "");
});

import { libraryClient } from "../src/services/library";
test("account saves are isolated from device storage, imports keep account values, and logout restores device entries", async () => {
  data.clear();
  setActivePinia(createPinia());
  const library = useLibraryStore();
  library.add(game);
  const backup = data.get("gamevault_library_v1");
  const remote = new Map<string, any>();
  libraryClient.defaults.adapter = async (config) => {
    const user = String(config.headers.Authorization);
    const key = user + ":" + game.slug;
    const body = config.data ? JSON.parse(config.data) : null;
    if (config.method === "post") {
      for (const entry of body.entries) {
        const id = user + ":" + entry.game.slug;
        if (!remote.has(id)) remote.set(id, entry);
      }
    } else if (config.method === "put") {
      if (!remote.has(key)) remote.set(key, body);
    } else if (config.method === "patch")
      remote.set(key, { ...remote.get(key), ...body });
    else if (config.method === "delete") remote.delete(key);
    return {
      data: {
        data:
          config.method === "get"
            ? [...remote]
                .filter(([id]) => id.startsWith(user + ":"))
                .map(([, value]) => value)
            : remote.get(key),
      },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  await library.connect("alice-token", "alice");
  assert.equal(library.entries.length, 0);
  await library.importDevice();
  await library.update(game.slug, { notes: "Account journal", hours: 20 });
  await library.importDevice();
  assert.equal(library.find(game.slug)?.notes, "Account journal");
  assert.equal(library.stats.hours, 20);
  assert.equal(data.get("gamevault_library_v1"), backup);
  await library.connect("bob-token", "bob");
  assert.equal(library.entries.length, 0);
  await library.connect(null, null);
  assert.equal(library.find(game.slug)?.notes, "");
  assert.equal(library.stats.hours, 0);
});
test("late account responses cannot leak into another session and failed saves remain unsaved", async () => {
  data.clear();
  setActivePinia(createPinia());
  const library = useLibraryStore();
  let release: (value: any) => void = () => {};
  libraryClient.defaults.adapter = (config) =>
    new Promise((resolve) => {
      release = () =>
        resolve({
          data: {
            data: [
              {
                game,
                status: "Completed",
                rating: 8,
                hours: 4,
                notes: "Private",
                favorite: true,
                addedAt: new Date().toISOString(),
              },
            ],
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        });
    });
  const connecting = library.connect("alice-token", "alice");
  await library.connect(null, null);
  release(null);
  await connecting;
  assert.equal(library.entries.length, 0);
  assert.equal(library.accountId, null);
  libraryClient.defaults.adapter = async (config) => ({
    data: { data: [] },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });
  await library.connect("alice-token", "alice");
  libraryClient.defaults.adapter = async () => {
    throw new Error("Offline");
  };
  await library.add(game);
  assert.equal(library.entries.length, 0);
  assert.ok(library.syncError);
  assert.equal(library.pending, 0);
});

test("stored sign-in tokens block device edits until identity is verified", async () => {
  data.clear();
  setActivePinia(createPinia());
  const library = useLibraryStore();
  library.add(game);
  const backup = data.get("gamevault_library_v1");
  await library.connect("unverified-token", null);
  assert.equal(library.syncState, "loading");
  assert.equal(library.entries.length, 0);
  await library.add(game);
  assert.equal(data.get("gamevault_library_v1"), backup);
  await library.connect(null, null);
  assert.equal(library.entries.length, 1);
});
