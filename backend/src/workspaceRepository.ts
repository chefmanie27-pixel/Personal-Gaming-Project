import type { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { workspaceSchema, type WorkspaceRepository } from "./workspace.js";
import { migrateJournal } from "./journalRepository.js";
export const databaseWorkspace: WorkspaceRepository = {
  async read(userId) {
    await migrateJournal(userId);
    const row = await prisma.userWorkspace.findUniqueOrThrow({
      where: { userId },
    });
    return {
      data: workspaceSchema.parse(row.data),
      version: row.version,
      journalMode: "normalized",
    };
  },
  async save(userId, version, data) {
    await migrateJournal(userId);
    if (data.journal.length)
      throw Object.assign(new Error("Use the journal API to save entries."), {
        status: 400,
      });
    return (
      (
        await prisma.userWorkspace.updateMany({
          where: { userId, version },
          data: {
            data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        })
      ).count === 1
    );
  },
};
