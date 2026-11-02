import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createLibraryRouter,
  type LibraryRepository,
  type SavedEntry,
} from "../src/library.js";
import { issueToken } from "../src/auth.js";
const entry = {
  game: {
    id: "steam-777",
    slug: "steam-777",
    title: "Library fixture",
    store: "Steam",
    cover: "https://example.com/cover.jpg",
  },
  status: "Completed",
  favorite: true,
  rating: 8.5,
  hours: 12,
  notes: "A personal journal",
  addedAt: "2026-01-01T00:00:00.000Z",
};
test("library API requires authentication, isolates accounts, validates input, and preserves imported conflicts", async () => {
  const rows = new Map<string, SavedEntry>();
  const repo: LibraryRepository = {
    async list(user) {
      return [...rows]
        .filter(([key]) => key.startsWith(user + ":"))
        .map(([, value]) => value);
    },
    async add(user, value) {
      const key = user + ":" + value.game.slug;
      if (!rows.has(key)) rows.set(key, value);
      return rows.get(key)!;
    },
    async update(user, slug, patch) {
      const key = user + ":" + slug;
      const row = rows.get(key);
      if (!row) return null;
      const result = { ...row, ...patch };
      rows.set(key, result);
      return result;
    },
    async remove(user, slug) {
      rows.delete(user + ":" + slug);
    },
    async import(user, entries) {
      for (const entry of entries) await this.add(user, entry);
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/library", createLibraryRouter(repo));
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port + "/library";
  const request = (user: string, path = "", method = "GET", body?: unknown) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(user
          ? {
              Authorization: "Bearer " + issueToken({ id: user, role: "USER" }),
            }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    assert.equal((await request("")).status, 401);
    assert.equal(
      (await request("alice", "/steam-777", "PUT", entry)).status,
      200,
    );
    assert.equal((await (await request("bob")).json()).data.length, 0);
    assert.equal(
      (await request("bob", "/steam-777", "PATCH", { notes: "Intrusion" }))
        .status,
      404,
    );
    assert.equal(
      (await request("alice", "/steam-777", "PATCH", { rating: 11 })).status,
      400,
    );
    assert.equal(
      (await request("alice", "/steam-777", "PATCH", { hours: -1 })).status,
      400,
    );
    assert.equal(
      (await request("alice", "/steam-777", "PATCH", { userId: "bob" })).status,
      400,
    );
    assert.equal(
      (
        await request("alice", "/steam-777", "PUT", {
          ...entry,
          game: { ...entry.game, storeUrl: "javascript:alert(1)" },
        })
      ).status,
      400,
    );
    assert.equal(
      (await request("alice", "/steam-778", "PUT", entry)).status,
      400,
    );
    assert.equal(
      (
        await request("alice", "/import", "POST", {
          entries: Array(26).fill(entry),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("alice", "/import", "POST", {
          entries: [{ ...entry, notes: "Device version" }],
        })
      ).status,
      200,
    );
    assert.equal(
      (await (await request("alice")).json()).data[0].notes,
      "A personal journal",
    );
    await request("bob", "/steam-777", "DELETE");
    assert.equal((await (await request("alice")).json()).data.length, 1);
    await request("alice", "/steam-777", "PATCH", {
      notes: "Updated",
      rating: 0,
    });
    assert.equal((await (await request("alice")).json()).data[0].rating, 0);
    await request("alice", "/steam-777", "DELETE");
    assert.equal((await (await request("alice")).json()).data.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
