import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db.js";
export const alertJobName = "price-alerts";
export class LostAlertLease extends Error {
  constructor() {
    super("Alert worker lease is no longer valid.");
    this.name = "LostAlertLease";
  }
}
async function clock(db: Prisma.TransactionClient) {
  const rows = await db.$queryRaw<
    Array<{ now: Date }>
  >`SELECT UTC_TIMESTAMP(3) AS now`;
  return rows[0].now;
}
function retryable(e: unknown) {
  if (!e || typeof e !== "object" || !("code" in e)) return false;
  return (
    e.code === "P2034" ||
    (e.code === "P2010" &&
      "meta" in e &&
      String((e.meta as { code?: unknown })?.code) === "1213")
  );
}
export async function claimAlertJob(client: PrismaClient = prisma) {
  // Initialize in its own committed statement: duplicate-key shared locks must not be upgraded inside the claim transaction.
  await client.$executeRaw`INSERT IGNORE INTO DurableAlertJob (name,nextRunAt,updatedAt) VALUES (${alertJobName},UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`;
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(
        async (db) => {
          await db.$queryRaw`SELECT name FROM DurableAlertJob WHERE name=${alertJobName} FOR UPDATE`;
          const row = await db.durableAlertJob.findUniqueOrThrow({
              where: { name: alertJobName },
            }),
            now = await clock(db);
          if (row.nextRunAt > now || (row.leaseUntil && row.leaseUntil > now))
            return null;
          const token = randomUUID();
          await db.durableAlertJob.update({
            where: { name: alertJobName },
            data: {
              leaseToken: token,
              leaseUntil: new Date(now.getTime() + 90000),
            },
          });
          return { token, cursor: row.cursor ?? undefined };
        },
        { timeout: 15000 },
      );
    } catch (e) {
      if (attempt >= 2 || !retryable(e)) throw e;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}
export async function renewAlertLease(
  db: Prisma.TransactionClient,
  token: string,
) {
  await db.$queryRaw`SELECT name FROM DurableAlertJob WHERE name=${alertJobName} FOR UPDATE`;
  const row = await db.durableAlertJob.findUnique({
      where: { name: alertJobName },
    }),
    now = await clock(db);
  if (
    !row ||
    row.leaseToken !== token ||
    !row.leaseUntil ||
    row.leaseUntil <= now
  )
    throw new LostAlertLease();
  await db.durableAlertJob.update({
    where: { name: alertJobName },
    data: { leaseUntil: new Date(now.getTime() + 90000) },
  });
  return now;
}
export async function finishAlertJob(
  token: string,
  cursor: string | null,
  failed = false,
  client: PrismaClient = prisma,
) {
  return client.$transaction(
    async (db) => {
      const now = await renewAlertLease(db, token),
        row = await db.durableAlertJob.findUniqueOrThrow({
          where: { name: alertJobName },
        });
      const failures = failed ? Math.min(5, row.failures + 1) : 0;
      await db.durableAlertJob.update({
        where: { name: alertJobName },
        data: {
          leaseToken: null,
          leaseUntil: null,
          ...(!failed ? { cursor, lastFinishedAt: now } : {}),
          failures,
          lastErrorCode: failed ? "EVALUATION_FAILED" : null,
          nextRunAt: new Date(
            now.getTime() +
              (failed
                ? 15000 * 2 ** (failures - 1)
                : cursor
                  ? 1000
                  : 15 * 60000),
          ),
        },
      });
    },
    { timeout: 15000 },
  );
}
