import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "./auth.js";
export const slug = z
  .string()
  .max(191)
  .regex(
    /^(steam|gog|epic|xboxpc|xbox|nintendo|rawg|playstation)-[a-zA-Z0-9_-]+$/,
  );
const image = z
  .string()
  .max(4096)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  });
export const snapshot = z.object({
  id: z.string().max(191),
  slug,
  title: z.string().min(1).max(500),
  tagline: z.string().max(5000).default(""),
  description: z.string().max(30000).default(""),
  cover: image.default(""),
  coverFallback: image.optional(),
  hero: image.default(""),
  genres: z.array(z.string().max(100)).max(50).default([]),
  platforms: z.array(z.string().max(100)).max(50).default([]),
  releaseDate: z.string().max(100).default(""),
  developer: z.string().max(1000).default("Unavailable"),
  publisher: z.string().max(1000).default("Unavailable"),
  score: z.number().finite().min(0).max(100).nullable().default(null),
  reviewCount: z.string().max(100).default(""),
  price: z.number().finite().nonnegative().nullable().default(null),
  originalPrice: z.number().finite().nonnegative().optional(),
  store: z.string().max(200),
  storefronts: z.array(z.string().max(100)).max(20).optional(),
  storeUrl: image.optional(),
  storeLinks: z.array(image).max(20).optional(),
  status: z.enum(["released", "upcoming"]).default("released"),
});
export const journalSchema = z
  .object({
    status: z.enum([
      "Want to Play",
      "Currently Playing",
      "Completed",
      "On Hold",
      "Dropped",
    ]),
    favorite: z.boolean(),
    rating: z.number().finite().min(0).max(10).nullable(),
    hours: z.number().finite().min(0).max(1000000),
    notes: z.string().max(10000),
  })
  .strict();
const entrySchema = journalSchema.extend({
  game: snapshot,
  addedAt: z.string().datetime().optional(),
});
export type Journal = z.infer<typeof journalSchema>;
export type SavedEntry = Journal & {
  game: z.infer<typeof snapshot>;
  addedAt: string;
};
export interface LibraryRepository {
  list(userId: string): Promise<SavedEntry[]>;
  bulkStatus?(
    userId: string,
    slugs: string[],
    status: Journal["status"],
  ): Promise<SavedEntry[] | null>;
  add(userId: string, entry: SavedEntry): Promise<SavedEntry>;
  update(
    userId: string,
    slug: string,
    patch: Partial<Journal>,
  ): Promise<SavedEntry | null>;
  remove(userId: string, slug: string): Promise<void>;
  import(userId: string, entries: SavedEntry[]): Promise<void>;
}
export function createLibraryRouter(repository: LibraryRepository) {
  const router = Router();
  router.use(requireAuth);
  router.get("/", async (req: AuthRequest, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json({ data: await repository.list(req.user!.id) });
    } catch (error) {
      next(error);
    }
  });
  router.post("/bulk-status", async (req: AuthRequest, res, next) => {
    const parsed = z
      .object({
        slugs: z
          .array(slug)
          .min(1)
          .max(20)
          .refine((v) => new Set(v).size === v.length),
        status: journalSchema.shape.status,
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          error: "Choose 1-20 distinct owned games and a valid status.",
        });
    if (!repository.bulkStatus)
      return res
        .status(503)
        .json({ error: "Bulk updates are unavailable on this server." });
    try {
      const rows = await repository.bulkStatus(
        req.user!.id,
        parsed.data.slugs,
        parsed.data.status,
      );
      return rows
        ? res.json({ data: rows })
        : res
            .status(404)
            .json({
              error:
                "One or more games are missing from your library. No statuses were changed.",
            });
    } catch (e) {
      next(e);
    }
  });
  router.post("/import", async (req: AuthRequest, res, next) => {
    const parsed = z
      .object({ entries: z.array(entrySchema).min(1).max(25) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Invalid collection import. Send up to 25 valid entries.",
      });
    try {
      await repository.import(
        req.user!.id,
        parsed.data.entries.map((e) => ({
          ...e,
          addedAt: e.addedAt ?? new Date().toISOString(),
        })),
      );
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  });
  router.put("/:slug", async (req: AuthRequest, res, next) => {
    const parsed = entrySchema.safeParse(req.body);
    const id = slug.safeParse(req.params.slug);
    if (!parsed.success || !id.success || parsed.data.game.slug !== id.data)
      return res.status(400).json({ error: "Invalid library entry." });
    try {
      return res.json({
        data: await repository.add(req.user!.id, {
          ...parsed.data,
          addedAt: parsed.data.addedAt ?? new Date().toISOString(),
        }),
      });
    } catch (error) {
      return next(error);
    }
  });
  router.patch("/:slug", async (req: AuthRequest, res, next) => {
    const parsed = journalSchema
      .partial()
      .refine((p) => Object.keys(p).length > 0)
      .safeParse(req.body);
    const id = slug.safeParse(req.params.slug);
    if (!parsed.success || !id.success)
      return res.status(400).json({ error: "Invalid journal update." });
    try {
      const entry = await repository.update(req.user!.id, id.data, parsed.data);
      return entry
        ? res.json({ data: entry })
        : res.status(404).json({ error: "Game is not in your library." });
    } catch (error) {
      return next(error);
    }
  });
  router.delete("/:slug", async (req: AuthRequest, res, next) => {
    const id = slug.safeParse(req.params.slug);
    if (!id.success)
      return res.status(400).json({ error: "Invalid game identifier." });
    try {
      await repository.remove(req.user!.id, id.data);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });
  return router;
}
