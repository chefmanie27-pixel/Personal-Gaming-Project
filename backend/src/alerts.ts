import { config } from "./config.js";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma as database } from "./db.js";
import { requireAuth, type AuthRequest } from "./auth.js";
import { slug } from "./library.js";
import { authRateLimit } from "./rateLimit.js";
export const alertTarget = z
  .number()
  .positive()
  .max(9999999999.99)
  .refine(
    (v) => /^\d+(?:\.\d{1,2})?$/.test(String(v)),
    "Use at most two decimal places.",
  );
export const createAlertSchema = z
  .object({
    gameSlug: slug,
    target: alertTarget,
    currency: z.literal("ZAR").default("ZAR"),
  })
  .strict();
const quoteWhere = {
  currency: "ZAR",
  region: "ZA",
  amount: { gte: 0 },
  sourceType: { notIn: ["mock", "seed", "development"] },
};
export function createAlertsRouter(
  prisma: PrismaClient = database,
  durableEnabled = config.DURABLE_ALERTS_ENABLED,
) {
  const r = Router();
  r.use(requireAuth);
  r.use((_q, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const limit = authRateLimit(60, 60000);
  r.use((q, res, next) => (q.method === "GET" ? next() : limit(q, res, next)));
  r.get("/capabilities", async (_req, res) => {
    if (!durableEnabled) return res.json({ history: false });
    try {
      await prisma.alertDelivery.findFirst({ select: { id: true } });
      return res.json({ history: true });
    } catch {
      return res.json({ history: false });
    }
  });
  r.get("/deliveries", async (req: AuthRequest, res, next) => {
    if (!durableEnabled)
      return res
        .status(503)
        .json({
          error: "Alert delivery history is not enabled on this server.",
        });
    const parsed = z
      .object({
        limit: z.coerce.number().int().min(1).max(50).default(20),
        cursor: z.string().max(500).optional(),
      })
      .strict()
      .safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid history page." });
    let cursor: { date: string; id: string } | undefined;
    if (parsed.data.cursor)
      try {
        cursor = z
          .object({
            date: z.string().datetime(),
            id: z.string().min(1).max(191),
          })
          .strict()
          .parse(
            JSON.parse(Buffer.from(parsed.data.cursor, "base64url").toString()),
          );
      } catch {
        return res.status(400).json({ error: "Invalid history cursor." });
      }
    try {
      const rows = await prisma.alertDelivery.findMany({
        where: {
          userId: req.user!.id,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: new Date(cursor.date) } },
                  { createdAt: new Date(cursor.date), id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: parsed.data.limit + 1,
      });
      const data = rows.slice(0, parsed.data.limit),
        last = data.at(-1);
      return res.json({
        data,
        nextCursor:
          rows.length > parsed.data.limit && last
            ? Buffer.from(
                JSON.stringify({
                  date: last.createdAt.toISOString(),
                  id: last.id,
                }),
              ).toString("base64url")
            : null,
      });
    } catch (e) {
      return next(e);
    }
  });
  r.get("/", async (req: AuthRequest, res, next) => {
    try {
      const alerts = await prisma.priceAlert.findMany({
        where: { userId: req.user!.id },
        include: {
          listing: {
            include: {
              game: true,
              store: true,
              prices: {
                where: {
                  region: "ZA",
                  currency: "ZAR",
                  sourceType: { notIn: ["mock", "seed", "development"] },
                  amount: { gte: 0 },
                  observedAt: { lte: new Date() },
                },
                orderBy: { observedAt: "desc" },
                take: 1,
              },
            },
          },
        },
        orderBy: { lastTriggered: "desc" },
      });
      return res.json({ data: alerts });
    } catch (error) {
      return next(error);
    }
  });

  r.post("/", async (req: AuthRequest, res, next) => {
    const parsed = createAlertSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error:
          "Choose a valid game and positive ZAR target with at most two decimal places.",
      });
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Account row serializes identical creates across processes without changing existing data or deleting legacy duplicates.
          const owner = await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM User WHERE id = ${req.user!.id} FOR UPDATE`;
          if (!owner.length)
            return {
              status: 401,
              error: "Account unavailable. Sign in again.",
            };
          const listing = await tx.storeListing.findFirst({
            where: {
              game: { slug: parsed.data.gameSlug },
              prices: {
                some: { ...quoteWhere, observedAt: { lte: new Date() } },
              },
            },
            orderBy: { id: "asc" },
          });
          if (!listing)
            return {
              status: 404,
              error: "No regional price listing is available for this game yet",
            };
          const where = {
            userId: req.user!.id,
            listingId: listing.id,
            target: parsed.data.target,
            currency: parsed.data.currency,
          };
          const include = { listing: { include: { game: true, store: true } } };
          const existing = await tx.priceAlert.findFirst({
            where,
            include,
            orderBy: { id: "asc" },
          });
          if (existing) return { status: 200, data: existing, existing: true };
          return {
            status: 201,
            data: await tx.priceAlert.create({ data: where, include }),
            existing: false,
          };
        },
        { timeout: 15000 },
      );
      if ("error" in result)
        return res.status(result.status).json({ error: result.error });
      return res
        .status(result.status)
        .json({ data: result.data, existing: result.existing });
    } catch (e) {
      return next(e);
    }
  });
  r.patch("/:id", async (req: AuthRequest, res, next) => {
    const parsed = z
      .object({
        active: z.boolean().optional(),
        target: alertTarget.optional(),
      })
      .strict()
      .refine(
        (value) => value.active !== undefined || value.target !== undefined,
      )
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Provide an active state or positive target price" });
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM User WHERE id = ${req.user!.id} FOR UPDATE`;
          const current = await tx.priceAlert.findFirst({
            where: { id: String(req.params.id), userId: req.user!.id },
          });
          if (!current) return 404;
          if (
            parsed.data.target !== undefined &&
            (await tx.priceAlert.findFirst({
              where: {
                userId: req.user!.id,
                listingId: current.listingId,
                currency: current.currency,
                target: parsed.data.target,
                id: { not: current.id },
              },
            }))
          )
            return 409;
          await tx.priceAlert.update({
            where: { id: current.id },
            data: parsed.data,
          });
          return 204;
        },
        { timeout: 15000 },
      );
      return result === 204
        ? res.status(204).send()
        : res.status(result).json({
            error:
              result === 409
                ? "An alert with this target already exists. Edit that alert instead."
                : "Alert not found",
          });
    } catch (error) {
      return next(error);
    }
  });

  r.delete("/:id", async (req: AuthRequest, res, next) => {
    try {
      const result = await prisma.priceAlert.deleteMany({
        where: { id: String(req.params.id), userId: req.user!.id },
      });
      return result.count
        ? res.status(204).send()
        : res.status(404).json({ error: "Alert not found" });
    } catch (error) {
      return next(error);
    }
  });

  return r;
}
