import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { config } from "./config.js";
import { requireAuth, type AuthRequest } from "./auth.js";
import { authRateLimit } from "./rateLimit.js";
import { gameCard, profileCard, canView, visibleUsers } from "./social.js";
import { slug } from "./library.js";
type DB = Prisma.TransactionClient;
class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new AccessError(status, message);
}
function parse<T>(schema: z.ZodType<T>, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success)
    fail(400, "Invalid discussion input. Check field lengths and try again.");
  return r.data;
}
const uuid = z.string().uuid(),
  body = z.string().trim().min(1).max(10000);
export const threadSchema = z
  .object({
    id: uuid.default(() => randomUUID()),
    game: gameCard,
    title: z.string().trim().min(1).max(120),
    body,
    spoiler: z.boolean(),
  })
  .strict();
const replySchema = z
  .object({
    id: uuid.default(() => randomUUID()),
    body: body.max(5000),
    spoiler: z.boolean(),
  })
  .strict();
const cursorSchema = z
  .object({ date: z.string().datetime(), id: z.string().min(1).max(191) })
  .strict();
function pagination(req: AuthRequest, ascending = false) {
  const p = parse(
    z.object({
      limit: z.coerce.number().int().min(1).max(30).default(20),
      cursor: z.string().max(500).optional(),
    }),
    req.query,
  );
  let c: z.infer<typeof cursorSchema> | undefined;
  if (p.cursor)
    try {
      c = parse(
        cursorSchema,
        JSON.parse(Buffer.from(p.cursor, "base64url").toString()),
      );
    } catch {
      fail(400, "Invalid discussion page cursor.");
    }
  return {
    ...p,
    after: c
      ? {
          OR: [
            { createdAt: { [ascending ? "gt" : "lt"]: new Date(c.date) } },
            {
              createdAt: new Date(c.date),
              id: { [ascending ? "gt" : "lt"]: c.id },
            },
          ],
        }
      : {},
  };
}
function page<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
) {
  const data = rows.slice(0, limit),
    last = data.at(-1);
  return {
    data,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ date: last.createdAt.toISOString(), id: last.id }),
          ).toString("base64url")
        : null,
  };
}
async function actor(db: DB, id: string) {
  const p = await db.socialProfile.findUnique({ where: { userId: id } });
  if (!p) fail(409, "Create a social profile before publishing discussions.");
  return p;
}
async function parent(db: DB, id: string, viewer?: string) {
  const p = await db.discussionThread.findFirst({
    where: { id, hidden: false, deleted: false },
    include: { user: { select: { socialProfile: true } } },
  });
  if (!p || !(await canView(db, p.userId, viewer)))
    fail(404, "Discussion unavailable.");
  return p;
}
const author = (p: { user: { socialProfile: any } }) =>
  p.user.socialProfile ? profileCard(p.user.socialProfile) : null;
async function admin(db: DB, id: string) {
  if (
    (await db.user.findUnique({ where: { id }, select: { role: true } }))
      ?.role !== "ADMIN"
  )
    fail(403, "Administrator access required.");
}
export function createDiscussionsRouter(enabled = config.DISCUSSIONS_ENABLED) {
  const r = Router();
  r.get("/capabilities", async (_q, res) => {
    if (!enabled) return res.json({ enabled: false });
    try {
      await prisma.discussionThread.findFirst({ select: { id: true } });
      return res.json({ enabled: true });
    } catch {
      return res.json({ enabled: false });
    }
  });
  r.use((_q, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!enabled)
      return res
        .status(503)
        .json({ error: "Game discussions are not available on this server." });
    next();
  });
  r.use((req: AuthRequest, res, next) =>
    req.header("authorization") ? requireAuth(req, res, next) : next(),
  );
  const limit = authRateLimit(80, 60000);
  r.use((q, res, next) => (q.method === "GET" ? next() : limit(q, res, next)));
  const route = (
    method: "get" | "post" | "patch" | "delete",
    path: string,
    auth: boolean,
    fn: (db: DB, req: AuthRequest) => Promise<unknown>,
  ) =>
    r[method](
      path,
      ...(auth ? [requireAuth] : []),
      async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
          let result: unknown;
          for (let n = 0; n < 3; n++) {
            try {
              result = await prisma.$transaction((db) => fn(db, req), {
                isolationLevel: "Serializable",
                timeout: 15000,
              });
              break;
            } catch (e) {
              if (
                e &&
                typeof e === "object" &&
                "code" in e &&
                e.code === "P2034" &&
                n < 2
              )
                continue;
              throw e;
            }
          }
          return res.json(result ?? { success: true });
        } catch (e) {
          if (e instanceof AccessError)
            return res.status(e.status).json({ error: e.message });
          if (e && typeof e === "object" && "code" in e) {
            if (e.code === "P2002")
              return res
                .status(409)
                .json({ error: "That publication or report already exists." });
            if (e.code === "P2021")
              return res
                .status(503)
                .json({
                  error: "Game discussions are not available on this server.",
                });
          }
          next(e);
        }
      },
    );
  route("get", "/", false, async (db, req) => {
    const p = pagination(req),
      gameSlug = req.query.slug ? parse(slug, req.query.slug) : undefined;
    const rows = await db.discussionThread.findMany({
      where: {
        hidden: false,
        deleted: false,
        ...(gameSlug ? { slug: gameSlug } : {}),
        AND: [p.after],
        user: await visibleUsers(db, req.user?.id),
      },
      include: { user: { select: { socialProfile: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: p.limit + 1,
    });
    const result = page(rows, p.limit);
    return {
      ...result,
      data: result.data.map(({ user, ...t }) => ({
        ...t,
        author: author({ user }),
      })),
    };
  });
  route("get", "/:id", false, async (db, req) => {
    const p = await parent(db, parse(uuid, req.params.id), req.user?.id);
    const { user, ...t } = p;
    return { data: { ...t, author: author({ user }) } };
  });
  route("post", "/", true, async (db, req) => {
    await actor(db, req.user!.id);
    const v = parse(threadSchema, req.body),
      old = await db.discussionThread.findUnique({ where: { id: v.id } });
    if (old) {
      if (old.userId !== req.user!.id || old.deleted || old.hidden)
        fail(409, "Publication ID unavailable.");
      return { data: old, existing: true };
    }
    return {
      data: await db.discussionThread.create({
        data: { ...v, userId: req.user!.id, slug: v.game.slug },
      }),
    };
  });
  route("patch", "/:id", true, async (db, req) => {
    const id = parse(uuid, req.params.id),
      v = parse(
        z
          .object({
            title: z.string().trim().min(1).max(120),
            body,
            spoiler: z.boolean(),
            version: z.number().int().nonnegative(),
          })
          .strict(),
        req.body,
      ),
      { version, ...data } = v;
    const changed = await db.discussionThread.updateMany({
      where: {
        id,
        userId: req.user!.id,
        version,
        hidden: false,
        deleted: false,
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (!changed.count)
      fail(409, "Discussion changed or is unavailable. Reload before editing.");
    return { data: await db.discussionThread.findUnique({ where: { id } }) };
  });
  route("delete", "/:id", true, async (db, req) => {
    const id = parse(uuid, req.params.id),
      version = parse(z.coerce.number().int().nonnegative(), req.query.version),
      old = await db.discussionThread.findFirst({
        where: { id, userId: req.user!.id },
      });
    if (!old) fail(404, "Discussion unavailable.");
    if (old.deleted) return;
    if (old.version !== version)
      fail(409, "Discussion changed. Reload before deleting.");
    await db.discussionThread.update({
      where: { id },
      data: { deleted: true, version: { increment: 1 } },
    });
  });
  route("get", "/:id/replies", false, async (db, req) => {
    const id = parse(uuid, req.params.id);
    await parent(db, id, req.user?.id);
    const p = pagination(req, true),
      rows = await db.discussionReply.findMany({
        where: {
          threadId: id,
          hidden: false,
          deleted: false,
          AND: [p.after],
          user: await visibleUsers(db, req.user?.id),
        },
        include: { user: { select: { socialProfile: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: p.limit + 1,
      }),
      result = page(rows, p.limit);
    return {
      ...result,
      data: result.data.map(({ user, ...reply }) => ({
        ...reply,
        author: author({ user }),
      })),
    };
  });
  route("post", "/:id/replies", true, async (db, req) => {
    const id = parse(uuid, req.params.id);
    await parent(db, id, req.user!.id);
    await actor(db, req.user!.id);
    const v = parse(replySchema, req.body),
      old = await db.discussionReply.findUnique({ where: { id: v.id } });
    if (old) {
      if (
        old.userId !== req.user!.id ||
        old.threadId !== id ||
        old.hidden ||
        old.deleted
      )
        fail(409, "Reply ID unavailable.");
      return { data: old, existing: true };
    }
    return {
      data: await db.discussionReply.create({
        data: { ...v, threadId: id, userId: req.user!.id },
      }),
    };
  });
  route("patch", "/:id/replies/:replyId", true, async (db, req) => {
    const id = parse(uuid, req.params.id);
    await parent(db, id, req.user!.id);
    const replyId = parse(uuid, req.params.replyId),
      v = parse(
        z
          .object({
            body: body.max(5000),
            spoiler: z.boolean(),
            version: z.number().int().nonnegative(),
          })
          .strict(),
        req.body,
      ),
      { version, ...data } = v;
    const changed = await db.discussionReply.updateMany({
      where: {
        id: replyId,
        threadId: id,
        userId: req.user!.id,
        version,
        hidden: false,
        deleted: false,
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (!changed.count) fail(409, "Reply changed or is unavailable.");
    return {
      data: await db.discussionReply.findUnique({ where: { id: replyId } }),
    };
  });
  route("delete", "/:id/replies/:replyId", true, async (db, req) => {
    const id = parse(uuid, req.params.id);
    await parent(db, id, req.user!.id);
    const replyId = parse(uuid, req.params.replyId),
      version = parse(z.coerce.number().int().nonnegative(), req.query.version),
      old = await db.discussionReply.findFirst({
        where: { id: replyId, threadId: id, userId: req.user!.id },
      });
    if (!old) fail(404, "Reply unavailable.");
    if (old.deleted) return;
    if (old.version !== version)
      fail(409, "Reply changed. Reload before deleting.");
    await db.discussionReply.update({
      where: { id: replyId },
      data: { deleted: true, version: { increment: 1 } },
    });
  });
  route("post", "/:id/report", true, async (db, req) => {
    const threadId = parse(uuid, req.params.id);
    await parent(db, threadId, req.user!.id);
    const v = parse(
      z
        .object({
          replyId: uuid.optional(),
          category: z.enum(["spam", "harassment", "spoilers", "other"]),
          reason: z.string().trim().min(3).max(1000),
        })
        .strict(),
      req.body,
    );
    if (v.replyId) {
      const reply = await db.discussionReply.findFirst({
        where: { id: v.replyId, threadId, hidden: false, deleted: false },
      });
      if (!reply || !(await canView(db, reply.userId, req.user!.id)))
        fail(404, "Reply unavailable.");
    }
    const targetKey = v.replyId ? "reply:" + v.replyId : "thread:" + threadId;
    await db.discussionReport.createMany({
      data: [
        {
          userId: req.user!.id,
          threadId,
          replyId: v.replyId,
          targetKey,
          category: v.category,
          reason: v.reason,
        },
      ],
      skipDuplicates: true,
    });
  });
  route("get", "/moderation/reports", true, async (db, req) => {
    await admin(db, req.user!.id);
    const p = pagination(req);
    const rows = await db.discussionReport.findMany({
      where: { status: "open", AND: [p.after] },
      include: { thread: true, reply: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: p.limit + 1,
    });
    return page(rows, p.limit);
  });
  route("post", "/moderation/reports/:reportId", true, async (db, req) => {
    await admin(db, req.user!.id);
    const v = parse(
        z
          .object({
            hide: z.boolean(),
            reason: z.string().trim().min(3).max(1000),
          })
          .strict(),
        req.body,
      ),
      report = await db.discussionReport.findUnique({
        where: { id: parse(z.string().min(1).max(191), req.params.reportId) },
      });
    if (!report) fail(404, "Report unavailable.");
    if (report.status === "resolved") return;
    if (v.hide) {
      if (report.replyId)
        await db.discussionReply.update({
          where: { id: report.replyId },
          data: { hidden: true, version: { increment: 1 } },
        });
      else
        await db.discussionThread.update({
          where: { id: report.threadId },
          data: { hidden: true, version: { increment: 1 } },
        });
    }
    await db.discussionReport.updateMany({
      where: { targetKey: report.targetKey, status: "open" },
      data: { status: "resolved" },
    });
    await db.moderationAction.create({
      data: {
        moderatorId: req.user!.id,
        targetKey: report.targetKey,
        action: v.hide ? "hide" : "dismiss",
        reason: v.reason,
      },
    });
  });
  route("get", "/moderation/actions", true, async (db, req) => {
    await admin(db, req.user!.id);
    const p = pagination(req),
      rows = await db.moderationAction.findMany({
        where: { AND: [p.after] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: p.limit + 1,
      });
    return page(rows, p.limit);
  });
  return r;
}
