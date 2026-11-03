import { activity, awardAchievements } from "./social.js";
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
async function socialLibrary(
  db: Prisma.TransactionClient,
  userId: string,
  slug: string,
) {
  const p = await db.socialProfile.findUnique({ where: { userId } });
  if (!p) return;
  const row = await db.libraryEntry.findUnique({
    where: { userId_slug: { userId, slug } },
  });
  if (row && p.shareLibrary) {
    const title = (row.game as { title?: string }).title ?? slug;
    await activity(db, userId, "added", slug, title);
    if (row.status === "Completed")
      await activity(db, userId, "completed", slug, title);
    if (row.favorite) await activity(db, userId, "favorite", slug, title);
  }
  await awardAchievements(db, userId);
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
  async bulkStatus(userId, slugs, status) {
    return prisma.$transaction(
      async (db) => {
        const owned = await db.libraryEntry.findMany({
          where: { userId, slug: { in: slugs } },
        });
        if (owned.length !== slugs.length) return null;
        await db.libraryEntry.updateMany({
          where: { userId, slug: { in: slugs } },
          data: { status },
        });
        const profile = await db.socialProfile.findUnique({
          where: { userId },
        });
        if (profile) {
          if (profile.shareLibrary) {
            const events = owned.flatMap((row) => {
              const title = (row.game as { title?: string }).title ?? row.slug;
              return [
                { userId, kind: "added", entityId: row.slug, title },
                ...(status === "Completed"
                  ? [{ userId, kind: "completed", entityId: row.slug, title }]
                  : []),
                ...(row.favorite
                  ? [{ userId, kind: "favorite", entityId: row.slug, title }]
                  : []),
              ];
            });
            await db.socialActivity.createMany({
              data: events,
              skipDuplicates: true,
            });
          }
          await awardAchievements(db, userId);
        }
        return (
          await db.libraryEntry.findMany({
            where: { userId, slug: { in: slugs } },
          })
        ).map(output);
      },
      { timeout: 20000, isolationLevel: "Serializable" },
    );
  },
  async add(userId, entry) {
    return prisma.$transaction(async (db) => {
      const saved = output(
        await db.libraryEntry.upsert({
          where: { userId_slug: { userId, slug: entry.game.slug } },
          create: create(userId, entry),
          update: {},
        }),
      );
      await socialLibrary(db, userId, entry.game.slug);
      return saved;
    });
  },
  async update(userId, slug, patch) {
    // A user-scoped unique key prevents another account's entry from being changed.
    try {
      return await prisma.$transaction(async (db) => {
        const saved = output(
          await db.libraryEntry.update({
            where: { userId_slug: { userId, slug } },
            data: patch,
          }),
        );
        await socialLibrary(db, userId, slug);
        return saved;
      });
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
