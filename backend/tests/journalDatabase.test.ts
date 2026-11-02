import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { journalItemSchema, workspaceSchema } from "../src/workspace.js";
import { journalQuerySchema } from "../src/journal.js";
test(
  "MySQL migration preserves journals, paginates without duplicates, isolates users and computes private yearly summaries",
  { skip: process.env.GAMEVAULT_DATABASE_TESTS !== "1" },
  async () => {
    const { prisma } = await import("../src/db.js");
    const { databaseJournal, migrateJournal } =
      await import("../src/journalRepository.js");
    const { databaseWorkspace } = await import("../src/workspaceRepository.js");
    const users: string[] = [];
    const entry = (
      n: number,
      date: string,
      kind: "session" | "review" = "session",
    ) =>
      journalItemSchema.parse({
        id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"),
        game: {
          id: "steam-123",
          slug: "steam-123",
          title: "Fixture",
          store: "Steam",
          genres: ["RPG"],
        },
        date,
        kind,
        minutes: kind === "session" ? 60 : 0,
        notes: "Secret private note " + n,
        progress: "Secret progress",
        tags: ["Private tag"],
        spoiler: true,
        rating: kind === "review" ? 9 : null,
      });
    try {
      for (let i = 0; i < 3; i++)
        users.push(
          (
            await prisma.user.create({
              data: {
                email: "journal-test-" + randomUUID() + "@example.invalid",
                passwordHash: "disabled-test-account",
              },
            })
          ).id,
        );
      const legacy = [
        entry(1, "2025-12-31"),
        entry(2, "2026-01-01"),
        entry(3, "2026-06-01", "review"),
      ];
      await prisma.userWorkspace.create({
        data: {
          userId: users[0],
          data: workspaceSchema.parse({
            journal: legacy,
          }) as Prisma.InputJsonValue,
        },
      });
      const workspace = await databaseWorkspace.read(users[0]);
      assert.equal(workspace.journalMode, "normalized");
      assert.equal(workspace.data.journal.length, 0);
      assert.equal(
        await prisma.journalRecord.count({ where: { userId: users[0] } }),
        3,
      );
      const first = await databaseJournal.list(
        users[0],
        journalQuerySchema.parse({ limit: 2 }),
      );
      assert.equal(first.data.length, 2);
      assert.equal(
        (
          await databaseJournal.list(
            users[0],
            journalQuerySchema.parse({ q: "PRIVATE TA", limit: 1 }),
          )
        ).meta.hasMore,
        true,
      );
      assert.equal(
        (
          await databaseJournal.list(
            users[0],
            journalQuerySchema.parse({ q: "2026" }),
          )
        ).data.length,
        2,
      );
      assert.equal(
        (
          await databaseJournal.list(
            users[0],
            journalQuerySchema.parse({ q: "%" }),
          )
        ).data.length,
        0,
      );
      assert.equal(
        (
          await databaseJournal.list(
            users[0],
            journalQuerySchema.parse({ q: "_" }),
          )
        ).data.length,
        0,
      );
      assert.equal(first.meta.hasMore, true);
      const second = await databaseJournal.list(
        users[0],
        journalQuerySchema.parse({
          limit: 2,
          cursor: JSON.stringify(first.meta.nextCursor),
        }),
      );
      assert.equal(second.data.length, 1);
      assert.equal(
        first.data.some((a) => second.data.some((b) => a.id === b.id)),
        false,
      );
      await databaseJournal.import(users[0], [
        { ...legacy[1], notes: "Do not overwrite" },
        entry(4, "2026-12-31"),
      ]);
      assert.equal(
        await databaseJournal.create(users[0], {
          ...legacy[1],
          notes: "Changed replay",
        }),
        "conflict",
      );
      assert.notEqual(
        await databaseJournal.create(users[0], legacy[1]),
        "conflict",
      );
      const changed = await databaseJournal.update(users[0], legacy[1].id, 0, {
        ...legacy[1],
        minutes: 120,
        notes: "Edited secret",
      });
      assert.notEqual(changed, "conflict");
      assert.equal(
        await databaseJournal.update(users[0], legacy[1].id, 0, legacy[1]),
        "conflict",
      );
      assert.equal(
        await databaseJournal.update(users[1], legacy[1].id, 0, legacy[1]),
        "missing",
      );
      assert.equal(
        await databaseJournal.remove(users[1], legacy[1].id, 0),
        "missing",
      );
      await databaseJournal.create(users[1], legacy[1]);
      assert.equal(
        (await databaseJournal.list(users[1], journalQuerySchema.parse({})))
          .data.length,
        1,
      );
      await databaseJournal.create(users[1], {
        ...entry(6, "2023-01-01"),
        notes:
          "Literal 100%_complete and " + String.fromCharCode(92) + " slash",
      });
      for (const q of ["%", "_", "100%_", String.fromCharCode(92)])
        assert.equal(
          (
            await databaseJournal.list(
              users[1],
              journalQuerySchema.parse({ q }),
            )
          ).data.length,
          1,
        );
      const summary = await databaseJournal.summary(users[0], 2026);
      assert.equal(summary.minutes, 180);
      assert.deepEqual(summary.genres, [["RPG", 180]]);
      assert.equal("description" in summary.mostPlayed!.game, false);
      assert.equal(summary.monthly[0], 120);
      assert.equal(summary.monthly[11], 60);
      assert.equal(summary.highestRated?.rating, 9);
      assert.equal(JSON.stringify(summary).includes("Secret"), false);
      assert.equal(
        await databaseWorkspace.save(users[0], workspace.version, {
          ...workspace.data,
          profile: { name: "Profile update", bio: "" },
        }),
        true,
      );
      await migrateJournal(users[0]);
      assert.equal(
        await prisma.journalRecord.count({ where: { userId: users[0] } }),
        4,
      );
      await assert.rejects(() =>
        databaseWorkspace.save(users[0], workspace.version + 1, {
          ...workspace.data,
          journal: legacy,
        }),
      );
      const bulk = Array.from({ length: 2100 }, (_, index) => ({
        ...entry(10000 + index, "2024-01-01"),
        minutes: 1,
      }));
      await databaseJournal.import(users[0], bulk);
      assert.equal(
        await prisma.journalRecord.count({ where: { userId: users[0] } }),
        2104,
      );
      assert.equal(
        (await databaseJournal.summary(users[0], 2024)).minutes,
        2100,
      );
      const broken = {
        ...workspaceSchema.parse({}),
        journal: [legacy[0], { ...legacy[1], id: "invalid" }],
      };
      await prisma.userWorkspace.create({
        data: { userId: users[2], data: broken as Prisma.InputJsonValue },
      });
      await assert.rejects(() => migrateJournal(users[2]));
      const preserved = await prisma.userWorkspace.findUniqueOrThrow({
        where: { userId: users[2] },
      });
      assert.equal(preserved.journalMigrated, false);
      assert.equal((preserved.data as any).journal.length, 2);
      assert.equal(
        await prisma.journalRecord.count({ where: { userId: users[2] } }),
        0,
      );
    } finally {
      if (users.length)
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.$disconnect();
    }
  },
);
