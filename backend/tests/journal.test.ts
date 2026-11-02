import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createJournalRouter,
  journalQuerySchema,
  type JournalRepository,
  type JournalRow,
} from "../src/journal.js";
import { journalItemSchema } from "../src/workspace.js";
import { issueToken } from "../src/auth.js";
const id = "11111111-1111-4111-8111-111111111111";
const entry = journalItemSchema.parse({
  id,
  game: {
    id: "steam-123",
    slug: "steam-123",
    title: "Fixture",
    store: "Steam",
  },
  date: "2026-01-01",
  kind: "session",
  minutes: 60,
  notes: "Private note",
  progress: "",
  tags: [],
  spoiler: true,
  rating: null,
});
test("journal filters reject invalid cursors, unsafe limits and kinds", () => {
  assert.equal(journalQuerySchema.parse({}).limit, 24);
  for (const value of [
    { limit: 51 },
    { kind: "public" },
    { cursor: "invalid" },
    { cursor: JSON.stringify({ date: "2026-02-30", id }) },
    { q: "x".repeat(201) },
  ])
    assert.equal(journalQuerySchema.safeParse(value).success, false);
});
test("journal routes require ownership and valid revisions for edits/deletes", async () => {
  const rows = new Map<string, JournalRow>();
  const repo: JournalRepository = {
    async list(user) {
      return {
        data: [...rows]
          .filter(([key]) => key.startsWith(user + ":"))
          .map(([, entry]) => entry),
        meta: { hasMore: false, nextCursor: null },
      };
    },
    async create(user, entry) {
      const key = user + ":" + entry.id;
      if (rows.has(key) && rows.get(key)!.notes !== entry.notes)
        return "conflict";
      if (!rows.has(key)) rows.set(key, { ...entry, version: 0 });
      return rows.get(key)!;
    },
    async update(user, id, version, entry) {
      const key = user + ":" + id,
        current = rows.get(key);
      if (!current) return "missing";
      if (current.version !== version) return "conflict";
      const saved = { ...entry, version: version + 1 };
      rows.set(key, saved);
      return saved;
    },
    async remove(user, id, version) {
      const key = user + ":" + id,
        current = rows.get(key);
      if (!current) return "missing";
      if (current.version !== version) return "conflict";
      rows.delete(key);
      return "ok";
    },
    async import(user, entries) {
      for (const entry of entries) await this.create(user, entry);
    },
    async summary() {
      return {
        minutes: 0,
        monthly: Array(12).fill(0),
        genres: [],
        highestRated: null,
        mostPlayed: null,
      };
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/journal", createJournalRouter(repo));
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port + "/journal";
  const request = (user: string, path = "", method = "GET", data?: unknown) =>
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
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  try {
    assert.equal((await request("")).status, 401);
    assert.equal((await request("alice", "", "POST", entry)).status, 201);
    assert.equal(
      (
        await request("alice", "", "POST", {
          ...entry,
          notes: "Different replay",
        })
      ).status,
      409,
    );
    assert.equal((await (await request("bob")).json()).data.length, 0);
    assert.equal(
      (await request("bob", "/" + id, "PATCH", { version: 0, entry })).status,
      404,
    );
    assert.equal(
      (await request("alice", "", "POST", { ...entry, userId: "bob" })).status,
      400,
    );
    assert.equal(
      (
        await request("alice", "/" + id, "PATCH", {
          version: 0,
          entry: { ...entry, notes: "Edited" },
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("alice", "/" + id, "PATCH", { version: 0, entry })).status,
      409,
    );
    assert.equal(
      (await request("alice", "/" + id + "?version=0", "DELETE")).status,
      409,
    );
    assert.equal((await request("alice", "/" + id, "DELETE")).status, 400);
    assert.equal(
      (await request("alice", "/" + id + "?version=1", "DELETE")).status,
      204,
    );
    assert.equal((await request("alice", "/summary?year=invalid")).status, 400);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
