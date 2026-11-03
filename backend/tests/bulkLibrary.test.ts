import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createLibraryRouter,
  type LibraryRepository,
  snapshot,
} from "../src/library.js";
import { issueToken } from "../src/auth.js";
import "dotenv/config";
test("bulk library API rejects unauthenticated/overposted/duplicate requests and scopes repository calls", async () => {
  let called: any;
  const repository = {
    async bulkStatus(userId: string, slugs: string[], status: string) {
      called = { userId, slugs, status };
      return userId === "alice" ? [] : null;
    },
  } as unknown as LibraryRepository;
  const app = express();
  app.use(express.json());
  app.use("/library", createLibraryRouter(repository));
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  async function send(user: string, body: unknown) {
    return fetch(base + "/library/bulk-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(user
          ? {
              Authorization: "Bearer " + issueToken({ id: user, role: "USER" }),
            }
          : {}),
      },
      body: JSON.stringify(body),
    });
  }
  try {
    const valid = { slugs: ["steam-1", "steam-2"], status: "Completed" };
    assert.equal((await send("", valid)).status, 401);
    for (const invalid of [
      { ...valid, userId: "bob" },
      { ...valid, slugs: ["steam-1", "steam-1"] },
      { ...valid, status: "other" },
      { ...valid, slugs: [] },
    ])
      assert.equal((await send("alice", invalid)).status, 400);
    assert.equal(called, undefined);
    assert.equal((await send("alice", valid)).status, 200);
    assert.deepEqual(called, { userId: "alice", ...valid });
    assert.equal((await send("bob", valid)).status, 404);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test(
  "MySQL bulk statuses are all-or-none and preserve notes, ratings and other accounts",
  { skip: process.env.GAMEVAULT_DATABASE_TESTS !== "1" },
  async () => {
    const { prisma } = await import("../src/db.js"),
      { databaseLibrary } = await import("../src/libraryRepository.js"),
      { randomUUID } = await import("node:crypto");
    const users: string[] = [];
    try {
      for (let i = 0; i < 2; i++)
        users.push(
          (
            await prisma.user.create({
              data: {
                email: "bulk-test-" + randomUUID() + "@example.invalid",
                passwordHash: "disabled",
              },
            })
          ).id,
        );
      const entry = (slug: string) => ({
        game: snapshot.parse({
          id: slug,
          slug,
          title: "Fixture",
          store: "Steam",
        }),
        status: "Want to Play" as const,
        favorite: true,
        rating: 8,
        hours: 12,
        notes: "Keep this note",
        addedAt: new Date().toISOString(),
      });
      await databaseLibrary.add(users[0], entry("steam-1"));
      await databaseLibrary.add(users[0], entry("steam-2"));
      await databaseLibrary.add(users[1], entry("steam-3"));
      assert.equal(
        await databaseLibrary.bulkStatus!(
          users[0],
          ["steam-1", "steam-3"],
          "Completed",
        ),
        null,
      );
      assert.equal(
        (await databaseLibrary.list(users[0]))[0].status,
        "Want to Play",
      );
      const rows = await databaseLibrary.bulkStatus!(
        users[0],
        ["steam-1", "steam-2"],
        "Completed",
      );
      assert.ok(
        rows?.every(
          (r) =>
            r.status === "Completed" &&
            r.notes === "Keep this note" &&
            r.rating === 8 &&
            r.hours === 12 &&
            r.favorite,
        ),
      );
      assert.equal(
        (await databaseLibrary.list(users[1]))[0].status,
        "Want to Play",
      );
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.$disconnect();
    }
  },
);
