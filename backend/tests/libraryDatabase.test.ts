import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SavedEntry } from "../src/library.js";
test(
  "MySQL account libraries persist, isolate users and retain account journals during concurrent imports",
  { skip: process.env.GAMEVAULT_DATABASE_TESTS !== "1" },
  async () => {
    const { prisma } = await import("../src/db.js");
    const { databaseLibrary } = await import("../src/libraryRepository.js");
    const created: string[] = [];
    try {
      for (let i = 0; i < 2; i++) {
        const user = await prisma.user.create({
          data: {
            email: "library-test-" + randomUUID() + "@example.invalid",
            passwordHash: "disabled-test-account",
          },
        });
        created.push(user.id);
      }
      const entry = {
        game: {
          id: "steam-887766",
          slug: "steam-887766",
          title: "Database smoke fixture",
          store: "Steam",
        },
        status: "Completed",
        favorite: true,
        rating: 9,
        hours: 15,
        notes: "Account journal",
        addedAt: new Date().toISOString(),
      } as SavedEntry;
      await databaseLibrary.add(created[0], entry);
      assert.equal((await databaseLibrary.list(created[1])).length, 0);
      assert.equal(
        await databaseLibrary.update(created[1], entry.game.slug, {
          notes: "Other account",
        }),
        null,
      );
      await Promise.all([
        databaseLibrary.import(created[0], [
          { ...entry, notes: "Device copy" },
        ]),
        databaseLibrary.import(created[0], [entry]),
      ]);
      const saved = await databaseLibrary.list(created[0]);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].notes, "Account journal");
      assert.equal(saved[0].hours, 15);
      await databaseLibrary.update(created[0], entry.game.slug, {
        rating: 0,
        notes: "Updated journal",
      });
      assert.equal((await databaseLibrary.list(created[0]))[0].rating, 0);
      await databaseLibrary.remove(created[1], entry.game.slug);
      assert.equal((await databaseLibrary.list(created[0])).length, 1);
      await databaseLibrary.remove(created[0], entry.game.slug);
      assert.equal((await databaseLibrary.list(created[0])).length, 0);
    } finally {
      if (created.length)
        await prisma.user.deleteMany({ where: { id: { in: created } } });
      await prisma.$disconnect();
    }
  },
);
