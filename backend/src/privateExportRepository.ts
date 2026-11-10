import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./db.js";
import { snapshot, journalSchema, type SavedEntry } from "./library.js";
import { journalItemSchema, workspaceSchema, type Workspace } from "./workspace.js";
import { PrivateExportBuilder, ExportDataError, type PrivateExportRepository } from "./privateExport.js";
const BATCH = 100;
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ExportDataError();
  return value as Record<string, any>;
}
// Validate persisted shapes, preserving private text and any stored snapshot extensions.
function workspaceData(value: unknown): Workspace {
  const raw = object(value), parsed = workspaceSchema.safeParse(raw);
  if (!parsed.success) throw new ExportDataError();
  const normalized = parsed.data;
  return { ...normalized, ...raw, profile: { ...normalized.profile, ...object(raw.profile ?? {}) }, preferences: { ...normalized.preferences, ...object(raw.preferences ?? {}) }, metadata: Object.fromEntries(Object.entries(normalized.metadata).map(([key, meta]) => [key, { ...meta, ...object(object(raw.metadata ?? {})[key] ?? {}) }])) };
}
function gameData(value: unknown) {
  const raw = object(value), parsed = snapshot.safeParse(raw);
  if (!parsed.success) throw new ExportDataError();
  return { ...parsed.data, ...raw } as SavedEntry["game"];
}
export async function readPrivateExportTransaction(tx: Prisma.TransactionClient, userId: string, maxBytes?: number): Promise<string> {
    const row = await tx.userWorkspace.findUnique({ where: { userId } });
    const workspace = workspaceData(row ? row.data : {});
    const mode = row?.journalMigrated ? "normalized" : "legacy";
    if (mode === "normalized" && workspace.journal.length) throw new ExportDataError();
    const output = new PrivateExportBuilder(workspace, mode, row?.version ?? null, maxBytes);
    let lastSlug: string | undefined;
    while (true) {
      const rows = await tx.libraryEntry.findMany({ where: { userId, ...(lastSlug ? { slug: { gt: lastSlug } } : {}) }, orderBy: { slug: "asc" }, take: BATCH });
      for (const entry of rows) {
        const fields = { status: entry.status, favorite: entry.favorite, rating: entry.rating, hours: entry.hours, notes: entry.notes };
        if (!journalSchema.safeParse(fields).success) throw new ExportDataError();
        const game = gameData(entry.game);
        if (game.slug !== entry.slug) throw new ExportDataError();
        output.library({ ...fields, game, addedAt: entry.addedAt.toISOString() } as SavedEntry);
      }
      if (rows.length < BATCH) break;
      const next = rows[rows.length - 1].slug;
      if (lastSlug !== undefined && next === lastSlug) throw new ExportDataError();
      lastSlug = next;
    }
    if (mode === "legacy") {
      // Do not migrate or merge inconsistent layouts during a read-only export.
      if (await tx.journalRecord.count({ where: { userId } })) throw new ExportDataError();
      const legacy = object(row ? row.data : {}).journal ?? [];
      for (const entry of [...legacy].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))) output.journal({ ...entry, game: gameData(entry.game) });
    } else {
      let cursor: { entryDate: Date; id: string } | undefined;
      while (true) {
        const rows = await tx.journalRecord.findMany({ where: { userId, ...(cursor ? { OR: [{ entryDate: { lt: cursor.entryDate } }, { entryDate: cursor.entryDate, id: { lt: cursor.id } }] } : {}) }, orderBy: [{ entryDate: "desc" }, { id: "desc" }], take: BATCH });
        for (const entry of rows) {
          const result = { id: entry.id, game: gameData(entry.game), date: entry.entryDate.toISOString().slice(0, 10), kind: entry.kind as "session" | "review", minutes: entry.minutes, notes: entry.notes, progress: entry.progress, tags: entry.tags as string[], spoiler: entry.spoiler, rating: entry.rating, version: entry.version };
          if (!journalItemSchema.safeParse(result).success || !Number.isInteger(result.version) || result.version < 0) throw new ExportDataError();
          output.journal(result);
        }
        if (rows.length < BATCH) break;
        const next = rows[rows.length - 1];
        if (cursor && (next.entryDate > cursor.entryDate || (+next.entryDate === +cursor.entryDate && next.id === cursor.id))) throw new ExportDataError();
        cursor = { entryDate: next.entryDate, id: next.id };
      }
    }
    return output.finish();
}
export async function readPrivateExport(client: PrismaClient, userId: string, maxBytes?: number): Promise<string> {
  return client.$transaction(tx => readPrivateExportTransaction(tx,userId,maxBytes), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 30000 });
}
export const databasePrivateExport: PrivateExportRepository = { read: userId => readPrivateExport(prisma, userId) };
