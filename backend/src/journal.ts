import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "./auth.js";
import { dateOnly, journalItemSchema } from "./workspace.js";
export type JournalItem = z.infer<typeof journalItemSchema>;
export type JournalRow = JournalItem & { version: number };
const cursorSchema = z
  .object({ date: dateOnly, id: z.string().uuid() })
  .strict();
export const journalQuerySchema = z.object({
  q: z.string().max(200).default(""),
  kind: z.enum(["session", "review"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z
    .string()
    .max(250)
    .transform((value, ctx) => {
      try {
        return cursorSchema.parse(JSON.parse(value));
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid journal cursor" });
        return z.NEVER;
      }
    })
    .optional(),
});
export type JournalQuery = z.infer<typeof journalQuerySchema>;
export interface JournalSummary {
  minutes: number;
  monthly: number[];
  genres: [string, number][];
  mostPlayed: {
    game: Pick<JournalItem["game"], "id" | "slug" | "title" | "cover">;
    minutes: number;
  } | null;
  highestRated: {
    game: Pick<JournalItem["game"], "id" | "slug" | "title" | "cover">;
    rating: number;
  } | null;
}
export interface JournalRepository {
  list(
    userId: string,
    query: JournalQuery,
  ): Promise<{
    data: JournalRow[];
    meta: { hasMore: boolean; nextCursor: { date: string; id: string } | null };
  }>;
  create(userId: string, entry: JournalItem): Promise<JournalRow | "conflict">;
  update(
    userId: string,
    id: string,
    version: number,
    entry: JournalItem,
  ): Promise<JournalRow | "missing" | "conflict">;
  remove(
    userId: string,
    id: string,
    version: number,
  ): Promise<"ok" | "missing" | "conflict">;
  import(userId: string, entries: JournalItem[]): Promise<void>;
  summary(userId: string, year: number): Promise<JournalSummary>;
}
export function createJournalRouter(repo: JournalRepository) {
  const router = Router();
  router.use(requireAuth);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/", async (req: AuthRequest, res, next) => {
    const input = journalQuerySchema.safeParse(req.query);
    if (!input.success)
      return res.status(400).json({ error: "Invalid journal filters." });
    try {
      return res.json(await repo.list(req.user!.id, input.data));
    } catch (error) {
      return next(error);
    }
  });
  router.get("/summary", async (req: AuthRequest, res, next) => {
    const year = z.coerce
      .number()
      .int()
      .min(1970)
      .max(2100)
      .safeParse(req.query.year);
    if (!year.success)
      return res.status(400).json({ error: "Invalid summary year." });
    try {
      return res.json({ data: await repo.summary(req.user!.id, year.data) });
    } catch (error) {
      return next(error);
    }
  });
  router.post("/import", async (req: AuthRequest, res, next) => {
    const input = z
      .object({ entries: z.array(journalItemSchema).min(1).max(25) })
      .strict()
      .safeParse(req.body);
    if (!input.success)
      return res
        .status(400)
        .json({ error: "Import up to 25 valid journal entries at a time." });
    try {
      await repo.import(req.user!.id, input.data.entries);
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  });
  router.post("/", async (req: AuthRequest, res, next) => {
    const input = journalItemSchema.strict().safeParse(req.body);
    if (!input.success)
      return res.status(400).json({ error: "Invalid journal entry." });
    try {
      const created = await repo.create(req.user!.id, input.data);
      return created === "conflict"
        ? res.status(409).json({
            error:
              "This identifier already belongs to an entry with different content. Reload before retrying.",
          })
        : res.status(201).json({ data: created });
    } catch (error) {
      return next(error);
    }
  });
  router.patch("/:id", async (req: AuthRequest, res, next) => {
    const input = z
      .object({
        version: z.number().int().nonnegative(),
        entry: journalItemSchema,
      })
      .strict()
      .safeParse(req.body);
    const id = z.string().uuid().safeParse(req.params.id);
    if (!input.success || !id.success || input.data.entry.id !== id.data)
      return res.status(400).json({ error: "Invalid journal update." });
    try {
      const saved = await repo.update(
        req.user!.id,
        id.data,
        input.data.version,
        input.data.entry,
      );
      if (saved === "missing")
        return res.status(404).json({ error: "Entry not found." });
      if (saved === "conflict")
        return res.status(409).json({
          error:
            "This entry changed in another session. Reload it before retrying.",
        });
      return res.json({ data: saved });
    } catch (error) {
      return next(error);
    }
  });
  router.delete("/:id", async (req: AuthRequest, res, next) => {
    const input = z
      .object({ version: z.coerce.number().int().nonnegative() })
      .safeParse(req.query);
    const id = z.string().uuid().safeParse(req.params.id);
    if (!input.success || !id.success)
      return res
        .status(400)
        .json({ error: "A valid entry version is required." });
    try {
      const result = await repo.remove(
        req.user!.id,
        id.data,
        input.data.version,
      );
      if (result === "conflict")
        return res.status(409).json({
          error:
            "This entry changed in another session. Reload before deleting.",
        });
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });
  return router;
}
