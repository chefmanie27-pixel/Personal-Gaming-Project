import type { JournalRecord, Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { workspaceSchema, journalItemSchema } from "./workspace.js";
import type {
  JournalItem,
  JournalRow,
  JournalRepository,
  JournalSummary,
} from "./journal.js";
function summaryGame(game: JournalItem["game"]) {
  return { id: game.id, slug: game.slug, title: game.title, cover: game.cover };
}
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function record(userId: string, entry: JournalItem) {
  return {
    userId,
    id: entry.id,
    slug: entry.game.slug,
    title: entry.game.title,
    searchText: [
      entry.date,
      entry.game.title,
      entry.notes,
      entry.progress,
      ...entry.tags,
    ].join(" "),
    game: json(entry.game),
    entryDate: new Date(entry.date + "T00:00:00Z"),
    kind: entry.kind,
    minutes: entry.minutes,
    notes: entry.notes,
    progress: entry.progress,
    tags: json(entry.tags),
    spoiler: entry.spoiler,
    rating: entry.rating,
  };
}
function output(row: JournalRecord): JournalRow {
  return {
    id: row.id,
    game: row.game as JournalItem["game"],
    date: row.entryDate.toISOString().slice(0, 10),
    kind: row.kind as JournalItem["kind"],
    minutes: row.minutes,
    notes: row.notes,
    progress: row.progress,
    tags: row.tags as string[],
    spoiler: row.spoiler,
    rating: row.rating,
    version: row.version,
  };
}
export async function migrateJournal(userId: string) {
  const existing = await prisma.userWorkspace.findUnique({
    where: { userId },
    select: { journalMigrated: true },
  });
  if (existing?.journalMigrated) return;
  try {
    const row = await prisma.userWorkspace.upsert({
      where: { userId },
      create: {
        userId,
        data: json(workspaceSchema.parse({})),
        journalMigrated: true,
      },
      update: {},
      select: { journalMigrated: true },
    });
    if (row.journalMigrated) return;
  } catch (error) {
    if (!(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ))
      throw error;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const migrated = await prisma.$transaction(async (tx) => {
      const row = await tx.userWorkspace.findUniqueOrThrow({
        where: { userId },
      });
      if (row.journalMigrated) return true;
      const data = workspaceSchema.parse(row.data);
      const changed = await tx.userWorkspace.updateMany({
        where: { userId, version: row.version, journalMigrated: false },
        data: {
          data: json({ ...data, journal: [] }),
          journalMigrated: true,
          version: { increment: 1 },
        },
      });
      if (!changed.count) return false;
      if (data.journal.length)
        await tx.journalRecord.createMany({
          data: data.journal.map((entry) => record(userId, entry)),
          skipDuplicates: true,
        });
      return true;
    });
    if (migrated) return;
  }
  throw new Error("Journal migration conflicted; retry the request");
}
export const databaseJournal: JournalRepository = {
  async list(userId, query) {
    await migrateJournal(userId);
    const and: Prisma.JournalRecordWhereInput[] = [];
    if (query.q)
      and.push({
        searchText: { contains: query.q.replace(/[\\%_]/g, "\\$&") },
      });
    if (query.cursor) {
      const date = new Date(query.cursor.date + "T00:00:00Z");
      and.push({
        OR: [
          { entryDate: { lt: date } },
          { entryDate: date, id: { lt: query.cursor.id } },
        ],
      });
    }
    const rows = await prisma.journalRecord.findMany({
      where: { userId, ...(query.kind ? { kind: query.kind } : {}), AND: and },
      orderBy: [{ entryDate: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const more = rows.length > query.limit;
    const data = rows.slice(0, query.limit).map(output);
    const last = data[data.length - 1];
    return {
      data,
      meta: {
        hasMore: more,
        nextCursor: more && last ? { date: last.date, id: last.id } : null,
      },
    };
  },
  async create(userId, entry) {
    await migrateJournal(userId);
    const created = await prisma.journalRecord.createMany({
      data: [record(userId, entry)],
      skipDuplicates: true,
    });
    const existing = output(
      await prisma.journalRecord.findUniqueOrThrow({
        where: { userId_id: { userId, id: entry.id } },
      }),
    );
    if (
      !created.count &&
      JSON.stringify(journalItemSchema.parse(existing)) !==
        JSON.stringify(journalItemSchema.parse(entry))
    )
      return "conflict";
    return existing;
  },
  async update(userId, id, version, entry) {
    await migrateJournal(userId);
    const { userId: _owner, id: _id, ...fields } = record(userId, entry);
    const changed = await prisma.journalRecord.updateMany({
      where: { userId, id, version },
      data: { ...fields, version: { increment: 1 } },
    });
    const row = await prisma.journalRecord.findUnique({
      where: { userId_id: { userId, id } },
    });
    if (!row) return "missing";
    return changed.count ? output(row) : "conflict";
  },
  async remove(userId, id, version) {
    await migrateJournal(userId);
    const removed = await prisma.journalRecord.deleteMany({
      where: { userId, id, version },
    });
    if (removed.count) return "ok";
    return (await prisma.journalRecord.findUnique({
      where: { userId_id: { userId, id } },
      select: { id: true },
    }))
      ? "conflict"
      : "missing";
  },
  async import(userId, entries) {
    await migrateJournal(userId);
    await prisma.journalRecord.createMany({
      data: entries.map((entry) => record(userId, entry)),
      skipDuplicates: true,
    });
  },
  async summary(userId, year) {
    await migrateJournal(userId);
    const result: JournalSummary = {
      minutes: 0,
      monthly: Array(12).fill(0),
      genres: [],
      mostPlayed: null,
      highestRated: null,
    };
    const genres = new Map<string, number>();
    const games = new Map<string, NonNullable<JournalSummary["mostPlayed"]>>();
    let cursor: { entryDate: Date; id: string } | undefined;
    while (true) {
      const batch = await prisma.journalRecord.findMany({
        where: {
          userId,
          AND: [
            {
              entryDate: {
                gte: new Date(Date.UTC(year, 0, 1)),
                lt: new Date(Date.UTC(year + 1, 0, 1)),
              },
            },
            ...(cursor
              ? [
                  {
                    OR: [
                      { entryDate: { gt: cursor.entryDate } },
                      { entryDate: cursor.entryDate, id: { gt: cursor.id } },
                    ],
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          entryDate: true,
          kind: true,
          minutes: true,
          rating: true,
          slug: true,
          game: true,
        },
        orderBy: [{ entryDate: "asc" }, { id: "asc" }],
        take: 500,
      });
      for (const entry of batch) {
        const game = entry.game as JournalItem["game"];
        if (entry.kind === "session") {
          result.minutes += entry.minutes;
          result.monthly[entry.entryDate.getUTCMonth()] += entry.minutes;
          const previous = games.get(entry.slug);
          games.set(entry.slug, {
            game: summaryGame(game),
            minutes: (previous?.minutes ?? 0) + entry.minutes,
          });
          for (const genre of game.genres)
            genres.set(genre, (genres.get(genre) ?? 0) + entry.minutes);
        } else if (
          entry.rating !== null &&
          (!result.highestRated || entry.rating >= result.highestRated.rating)
        )
          result.highestRated = {
            game: summaryGame(game),
            rating: entry.rating,
          };
      }
      if (batch.length < 500) break;
      const last = batch[batch.length - 1];
      cursor = { entryDate: last.entryDate, id: last.id };
    }
    result.genres = [...genres].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    result.mostPlayed =
      [...games.values()].sort(
        (a, b) =>
          b.minutes - a.minutes || a.game.title.localeCompare(b.game.title),
      )[0] ?? null;
    return result;
  },
};
