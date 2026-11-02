import type { LibraryEntry, Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import type { SavedEntry, LibraryRepository } from "./library.js";
function output(row: LibraryEntry): SavedEntry {
  return {
    game: row.game as SavedEntry["game"],
    status: row.status as SavedEntry["status"],
    favorite: row.favorite,
    rating: row.rating,
    hours: row.hours,
    notes: row.notes,
    addedAt: row.addedAt.toISOString(),
  };
}
function create(userId: string, entry: SavedEntry) {
  return {
    userId,
    slug: entry.game.slug,
    game: JSON.parse(JSON.stringify(entry.game)) as Prisma.InputJsonValue,
    status: entry.status,
    favorite: entry.favorite,
    rating: entry.rating,
    hours: entry.hours,
    notes: entry.notes,
    addedAt: new Date(entry.addedAt),
  };
}
export const databaseLibrary: LibraryRepository = {
  async list(userId) {
    return (
      await prisma.libraryEntry.findMany({
        where: { userId },
        orderBy: { addedAt: "desc" },
      })
    ).map(output);
  },
  async add(userId, entry) {
    return output(
      await prisma.libraryEntry.upsert({
        where: { userId_slug: { userId, slug: entry.game.slug } },
        create: create(userId, entry),
        update: {},
      }),
    );
  },
  async update(userId, slug, patch) {
    // A user-scoped unique key prevents another account's entry from being changed.
    try {
      return output(
        await prisma.libraryEntry.update({
          where: { userId_slug: { userId, slug } },
          data: patch,
        }),
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2025"
      )
        return null;
      throw error;
    }
  },
  async remove(userId, slug) {
    await prisma.libraryEntry.deleteMany({ where: { userId, slug } });
  },
  async import(userId, entries) {
    await prisma.$transaction(
      entries.map((entry) =>
        prisma.libraryEntry.upsert({
          where: { userId_slug: { userId, slug: entry.game.slug } },
          create: create(userId, entry),
          update: {},
        }),
      ),
    );
  },
};
