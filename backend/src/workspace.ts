import { priceAlertRulesSchema } from "./priceRules.js";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "./auth.js";
import { snapshot, slug } from "./library.js";
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
const id = z.string().uuid();
export const journalItemSchema = z.object({
  id,
  game: snapshot,
  date: dateOnly,
  kind: z.enum(["session", "review"]),
  minutes: z.number().int().min(0).max(1440),
  notes: z.string().trim().min(1).max(10000),
  progress: z.string().max(1000),
  tags: z.array(z.string().max(40)).max(10),
  spoiler: z.boolean(),
  rating: z.number().min(0).max(10).nullable(),
});
export const workspaceSchema = z
  .object({
    profile: z
      .object({ name: z.string().max(80), bio: z.string().max(1000) })
      .default({ name: "", bio: "" }),
    preferences: z
      .object({
        genres: z.array(z.string().min(1).max(100)).max(30),
        platforms: z.array(z.string().min(1).max(100)).max(30),
        priceAlertRules: priceAlertRulesSchema.optional(),
        recommendationFeedback: z
          .record(
            slug,
            z
              .object({
                choice: z.enum(["interested", "not-interested", "less-like"]),
                genres: z.array(z.string().max(100)).max(10),
                title: z.string().max(500),
                at: z.string().datetime(),
              })
              .strict(),
          )
          .refine(
            (v) => Object.keys(v).length <= 500,
            "Keep at most 500 feedback entries",
          )
          .optional(),
        libraryView: z.enum(["grid", "list"]).optional(),
        librarySort: z
          .enum(["added", "title", "rating", "priority"])
          .optional(),
      })
      .default({ genres: [], platforms: [] }),
    goals: z
      .array(
        z
          .object({
            id,
            challengeKey: z
              .enum(["monthly-three", "session-ten", "time-300"])
              .optional(),
            title: z.string().trim().min(1).max(80),
            kind: z.enum(["completed", "sessions", "minutes"]),
            target: z.number().int().min(1).max(1000000),
            start: dateOnly,
            end: dateOnly,
          })
          .strict()
          .refine(
            (g) =>
              g.start <= g.end &&
              g.start.slice(0, 4) === g.end.slice(0, 4) &&
              Number(g.start.slice(0, 4)) >= 1970 &&
              Number(g.start.slice(0, 4)) <= 2100,
            "Choose an ordered period within one calendar year",
          ),
      )
      .max(50)
      .refine(
        (v) => new Set(v.map((g) => g.id)).size === v.length,
        "Duplicate goal IDs",
      )
      .optional(),
    collections: z
      .array(z.object({ id, name: z.string().trim().min(1).max(80) }))
      .max(100)
      .default([]),
    metadata: z
      .record(
        slug,
        z.object({
          completedAt: dateOnly.nullable().default(null),
          targetDate: dateOnly.nullable().optional(),
          priority: z.enum(["Low", "Normal", "High"]).default("Normal"),
          collectionIds: z.array(id).max(100).default([]),
        }),
      )
      .refine((v) => Object.keys(v).length <= 5000)
      .default({}),
    journal: z.array(journalItemSchema).max(2000).default([]),
    watches: z
      .array(
        z.object({
          game: snapshot,
          followedAt: z.string().datetime(),
          previousDate: z.string().max(100).optional(),
        }),
      )
      .max(1000)
      .default([]),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > 4 * 1024 * 1024)
      ctx.addIssue({
        code: "custom",
        message: "Workspace exceeds the 4 MiB limit",
      });
    for (const field of ["collections", "journal"] as const) {
      const ids = data[field].map((v) => v.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Duplicate identifiers",
        });
    }
    const slugs = data.watches.map((v) => v.game.slug);
    if (new Set(slugs).size !== slugs.length)
      ctx.addIssue({
        code: "custom",
        path: ["watches"],
        message: "Duplicate watched games",
      });
    const collectionIds = new Set(data.collections.map((c) => c.id));
    for (const [slug, meta] of Object.entries(data.metadata))
      if (meta.collectionIds.some((id) => !collectionIds.has(id)))
        ctx.addIssue({
          code: "custom",
          path: ["metadata", slug],
          message: "Unknown collection",
        });
  });
export type Workspace = z.infer<typeof workspaceSchema>;
export interface WorkspaceRepository {
  read(
    userId: string,
  ): Promise<{ data: Workspace; version: number; journalMode?: "normalized" }>;
  save(userId: string, version: number, data: Workspace): Promise<boolean>;
}
export function createWorkspaceRouter(repo: WorkspaceRepository) {
  const router = Router();
  router.use(requireAuth);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/", async (req: AuthRequest, res, next) => {
    try {
      return res.json(await repo.read(req.user!.id));
    } catch (error) {
      return next(error);
    }
  });
  router.put("/", async (req: AuthRequest, res, next) => {
    const input = z
      .object({
        version: z.number().int().nonnegative(),
        data: workspaceSchema,
      })
      .strict()
      .safeParse(req.body);
    if (!input.success)
      return res.status(400).json({
        error: "Invalid workspace data.",
        details: input.error.flatten(),
      });
    try {
      const saved = await repo.save(
        req.user!.id,
        input.data.version,
        input.data.data,
      );
      return saved
        ? res.json(await repo.read(req.user!.id))
        : res.status(409).json({
            error:
              "Your workspace changed in another session. Reload before retrying.",
          });
    } catch (error) {
      return next(error);
    }
  });
  return router;
}
