import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import type { Prisma, PrismaClient, SocialProfile } from "@prisma/client";
import { prisma } from "./db.js";
import { requireAuth, type AuthRequest } from "./auth.js";
import { authRateLimit } from "./rateLimit.js";
import { snapshot, slug } from "./library.js";

type DB = Prisma.TransactionClient;
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{2,29}$/)
  .refine(
    (v) =>
      ![
        "admin",
        "api",
        "me",
        "settings",
        "support",
        "moderator",
        "gamevault",
      ].includes(v),
  );
export const artwork = z
  .string()
  .max(1024)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  });
export const settingsSchema = z
  .object({
    accent: z.enum(["violet", "cyan", "rose", "amber"]).default("violet"),
    density: z.enum(["comfortable", "compact"]).default("comfortable"),
    reducedMotion: z.boolean().default(false),
    showRecommendations: z.boolean().default(true),
    showStats: z.boolean().default(true),
    notifications: z.boolean().default(true),
  })
  .strict();
export const profileSchema = z
  .object({
    username,
    name: z.string().trim().min(1).max(80),
    bio: z.string().max(1000).default(""),
    avatar: artwork.default(""),
    banner: artwork.default(""),
    visibility: z.enum(["public", "private"]).default("private"),
    shareLibrary: z.boolean().default(false),
    settings: settingsSchema.default(() => settingsSchema.parse({})),
    version: z.number().int().nonnegative().default(0),
  })
  .strict();
export const gameCard = snapshot.pick({
  id: true,
  slug: true,
  title: true,
  cover: true,
  genres: true,
  platforms: true,
});
export const reviewSchema = z
  .object({
    game: gameCard,
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(10000),
    rating: z.number().finite().min(0).max(10),
    spoiler: z.boolean(),
    version: z.number().int().nonnegative().default(0),
  })
  .strict();
export const collectionSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(2000),
    cover: artwork,
    theme: z.string().max(80),
    visibility: z.enum(["public", "private"]),
    games: z.array(gameCard).max(100),
    version: z.number().int().nonnegative().default(0),
  })
  .strict()
  .refine(
    (v) => new Set(v.games.map((g) => g.slug)).size === v.games.length,
    "Duplicate games",
  );
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(20),
  cursor: z.string().max(600).optional(),
  q: z.string().trim().max(100).default(""),
});
const cursorSchema = z
  .object({ id: z.string().min(1).max(191), date: z.string().datetime() })
  .strict();
export class SocialError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new SocialError(status, message);
}
function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  if (!p.success)
    return fail(400, "Invalid input. Check the field limits and retry.");
  return p.data;
}
function literalSearch(value: string) {
  return [...value]
    .map((c) =>
      ["%", "_", String.fromCharCode(92)].includes(c)
        ? String.fromCharCode(92) + c
        : c,
    )
    .join("");
}
function pagination(req: Request) {
  const p = input(pageSchema, req.query);
  let c: z.infer<typeof cursorSchema> | undefined;
  if (p.cursor) {
    try {
      c = input(
        cursorSchema,
        JSON.parse(Buffer.from(p.cursor, "base64url").toString()),
      );
    } catch {
      fail(400, "Invalid page cursor.");
    }
  }
  return {
    ...p,
    after: c
      ? {
          OR: [
            { createdAt: { lt: new Date(c.date) } },
            { createdAt: new Date(c.date), id: { lt: c.id } },
          ],
        }
      : {},
  };
}
function paged<T extends { id: string; createdAt: Date }>(
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
            JSON.stringify({ id: last.id, date: last.createdAt.toISOString() }),
          ).toString("base64url")
        : null,
  };
}
export function safeGame(value: unknown) {
  const g = gameCard.safeParse(value);
  return g.success ? g.data : null;
}
export function profileCard(p: SocialProfile) {
  return {
    userId: p.userId,
    username: p.username,
    name: p.name,
    avatar: p.avatar,
    visibility: p.visibility,
  };
}
async function blockedIds(db: DB, id?: string) {
  if (!id) return [];
  const b = await db.blockEdge.findMany({
    where: { OR: [{ blockerId: id }, { blockedId: id }] },
  });
  return b.map((v) => (v.blockerId === id ? v.blockedId : v.blockerId));
}
export async function canView(db: DB, owner: string, viewer?: string) {
  if (owner === viewer) return true;
  if (
    viewer &&
    (await db.blockEdge.count({
      where: {
        OR: [
          { blockerId: owner, blockedId: viewer },
          { blockerId: viewer, blockedId: owner },
        ],
      },
    }))
  )
    return false;
  const p = await db.socialProfile.findUnique({ where: { userId: owner } });
  if (!p) return false;
  return (
    p.visibility === "public" ||
    !!(
      viewer &&
      (await db.followEdge.findFirst({
        where: { followerId: viewer, followedId: owner, accepted: true },
      }))
    )
  );
}
async function visibleUsers(
  db: DB,
  viewer?: string,
): Promise<Prisma.UserWhereInput> {
  const blocked = await blockedIds(db, viewer);
  return {
    id: { notIn: blocked },
    OR: [
      { socialProfile: { is: { visibility: "public" } } },
      ...(viewer
        ? [
            { id: viewer },
            { followsIn: { some: { followerId: viewer, accepted: true } } },
          ]
        : []),
    ],
  };
}
async function actor(db: DB, id: string) {
  const p = await db.socialProfile.findUnique({ where: { userId: id } });
  if (!p) fail(409, "Create your social profile first.");
  return p;
}
async function target(db: DB, owner: string, viewer?: string) {
  if (!(await canView(db, owner, viewer))) fail(404, "Content is unavailable.");
}
export async function notify(
  db: DB,
  userId: string,
  dedupe: string,
  kind: string,
  message: string,
  actorId?: string,
  entityId?: string,
) {
  const p = await db.socialProfile.findUnique({ where: { userId } });
  if (!p || !settingsSchema.parse(p.settings).notifications) return;
  await db.socialNotification.createMany({
    data: [{ userId, dedupe, kind, message, actorId, entityId }],
    skipDuplicates: true,
  });
}
export async function activity(
  db: DB,
  userId: string,
  kind: string,
  entityId: string,
  title: string,
) {
  await db.socialActivity.createMany({
    data: [{ userId, kind, entityId, title: title.slice(0, 500) }],
    skipDuplicates: true,
  });
}
export const achievementDefinitions = [
  { key: "first_game", name: "First Game Added", target: 1 },
  { key: "first_review", name: "First Review Published", target: 1 },
  { key: "ten_completed", name: "Ten Games Completed", target: 10 },
  { key: "fifty_games", name: "Fifty Games Collected", target: 50 },
  { key: "backlog_explorer", name: "Backlog Explorer", target: 5 },
  { key: "genre_specialist", name: "Genre Specialist", target: 10 },
  { key: "collection_curator", name: "Collection Curator", target: 1 },
  { key: "gaming_historian", name: "Gaming Historian", target: 30 },
];
export async function awardAchievements(db: DB, userId: string) {
  const [games, reviews, collections, journals] = await Promise.all([
    db.libraryEntry.findMany({
      where: { userId },
      select: { game: true, status: true },
    }),
    db.communityReview.count({ where: { userId, hidden: false } }),
    db.publishedCollection.count({ where: { userId, visibility: "public" } }),
    db.journalRecord.count({ where: { userId } }),
  ]);
  const genres = new Map<string, number>();
  for (const row of games)
    for (const g of new Set(safeGame(row.game)?.genres ?? []))
      genres.set(g, (genres.get(g) ?? 0) + 1);
  const completed = games.filter((g) => g.status === "Completed").length;
  const values: Record<string, number> = {
    first_game: games.length,
    first_review: reviews,
    ten_completed: completed,
    fifty_games: games.length,
    backlog_explorer: completed,
    genre_specialist: Math.max(0, ...genres.values()),
    collection_curator: collections,
    gaming_historian: journals,
  };
  for (const def of achievementDefinitions)
    if (values[def.key] >= def.target) {
      const created = await db.achievementUnlock.createMany({
        data: [{ userId, key: def.key }],
        skipDuplicates: true,
      });
      if (created.count) {
        await activity(db, userId, "achievement", def.key, def.name);
        await notify(
          db,
          userId,
          "achievement:" + def.key,
          "achievement",
          "Achievement unlocked: " + def.name,
          undefined,
          def.key,
        );
      }
    }
  const unlocked = await db.achievementUnlock.findMany({ where: { userId } });
  return achievementDefinitions.map((d) => ({
    ...d,
    progress: Math.min(values[d.key], d.target),
    unlockedAt: unlocked.find((u) => u.key === d.key)?.unlockedAt ?? null,
  }));
}
async function reviewDto(
  db: DB,
  r: Awaited<ReturnType<DB["communityReview"]["findFirstOrThrow"]>>,
  viewer?: string,
) {
  const p = await db.socialProfile.findUniqueOrThrow({
    where: { userId: r.userId },
  });
  return {
    ...r,
    game: safeGame(r.game),
    author: profileCard(p),
    likes: await db.reviewLike.count({ where: { reviewId: r.id } }),
    liked: !!(
      viewer &&
      (await db.reviewLike.findUnique({
        where: { userId_reviewId: { userId: viewer, reviewId: r.id } },
      }))
    ),
  };
}
export function createSocialRouter(client: PrismaClient = prisma) {
  const router = Router();
  router.use((req: AuthRequest, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.header("authorization")) return requireAuth(req, res, next);
    return next();
  });
  router.use((req, res, next) =>
    req.method === "GET" ? next() : authRate(req, res, next),
  );
  const authRate = authRateLimit(100, 60000);
  const route = (
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    auth: boolean,
    fn: (db: DB, req: AuthRequest) => Promise<unknown>,
  ) => {
    router[method](
      path,
      ...(auth ? [requireAuth] : []),
      async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
          let result: unknown;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              result = await client.$transaction(
                async (db) => {
                  if (
                    req.user &&
                    !(await db.user.findUnique({
                      where: { id: req.user.id },
                      select: { id: true },
                    }))
                  )
                    fail(401, "Account no longer exists.");
                  return fn(db, req);
                },
                { isolationLevel: "Serializable", timeout: 20000 },
              );
              break;
            } catch (e) {
              if (
                e &&
                typeof e === "object" &&
                "code" in e &&
                e.code === "P2034" &&
                attempt < 2
              )
                continue;
              throw e;
            }
          }
          res.json(result ?? { success: true });
        } catch (e) {
          if (e instanceof SocialError)
            return res.status(e.status).json({ error: e.message });
          if (e && typeof e === "object" && "code" in e && e.code === "P2002")
            return res
              .status(409)
              .json({ error: "That username or record is already in use." });
          return next(e);
        }
      },
    );
  };
  route("get", "/me", true, async (db, req) => ({
    data: await db.socialProfile.findUnique({
      where: { userId: req.user!.id },
    }),
  }));
  route("put", "/me", true, async (db, req) => {
    const v = input(profileSchema, req.body),
      id = req.user!.id;
    const { version, ...data } = v;
    const old = await db.socialProfile.findUnique({ where: { userId: id } });
    if (old) {
      if (
        !(
          await db.socialProfile.updateMany({
            where: { userId: id, version },
            data: { ...data, version: { increment: 1 } },
          })
        ).count
      )
        fail(409, "Profile changed. Reload before editing.");
    } else {
      if (version !== 0) fail(409, "Reload your profile.");
      await db.socialProfile.create({ data: { ...data, userId: id } });
    }
    return {
      data: await db.socialProfile.findUnique({ where: { userId: id } }),
    };
  });
  route("get", "/users", false, async (db, req) => {
    const p = input(pageSchema, req.query),
      offset = input(
        z.coerce.number().int().min(0).max(100000).default(0),
        req.query.offset,
      );
    const blocked = await blockedIds(db, req.user?.id);
    const rows = await db.socialProfile.findMany({
      where: {
        userId: { notIn: [...blocked, ...(req.user ? [req.user.id] : [])] },
        ...(p.q
          ? {
              OR: [
                { username: { contains: literalSearch(p.q) } },
                { name: { contains: literalSearch(p.q) } },
              ],
            }
          : {}),
      },
      orderBy: { username: "asc" },
      skip: offset,
      take: p.limit + 1,
    });
    return {
      data: rows.slice(0, p.limit).map(profileCard),
      nextOffset: rows.length > p.limit ? offset + p.limit : null,
    };
  });
  route("get", "/profiles/:username", false, async (db, req) => {
    const name = input(username, req.params.username);
    const p = await db.socialProfile.findUnique({ where: { username: name } });
    if (!p) fail(404, "Profile not found.");
    const viewer = req.user?.id;
    if ((await blockedIds(db, viewer)).includes(p.userId))
      fail(404, "Profile not found.");
    const following = viewer
      ? await db.followEdge.findUnique({
          where: {
            followerId_followedId: { followerId: viewer, followedId: p.userId },
          },
        })
      : null;
    const visible = await canView(db, p.userId, viewer);
    if (!visible)
      return {
        data: {
          ...profileCard(p),
          locked: true,
          relationship: following ? "pending" : "none",
        },
      };
    const [followers, followingCount, unlocks] = await Promise.all([
      db.followEdge.count({ where: { followedId: p.userId, accepted: true } }),
      db.followEdge.count({ where: { followerId: p.userId, accepted: true } }),
      db.achievementUnlock.findMany({ where: { userId: p.userId } }),
    ]);
    const stats =
      p.shareLibrary || viewer === p.userId
        ? {
            games: await db.libraryEntry.count({ where: { userId: p.userId } }),
            completed: await db.libraryEntry.count({
              where: { userId: p.userId, status: "Completed" },
            }),
          }
        : null;
    const recentCompleted =
      p.shareLibrary || viewer === p.userId
        ? await db.libraryEntry.findMany({
            where: { userId: p.userId, status: "Completed" },
            select: { game: true },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 6,
          })
        : [];
    const library =
      p.shareLibrary || viewer === p.userId
        ? await db.libraryEntry.findMany({
            where: { userId: p.userId },
            select: { game: true, status: true, favorite: true },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 25,
          })
        : [];
    return {
      data: {
        ...profileCard(p),
        bio: p.bio,
        banner: p.banner,
        accent: settingsSchema.parse(p.settings).accent,
        locked: false,
        shareLibrary: p.shareLibrary,
        relationship: following
          ? following.accepted
            ? "following"
            : "pending"
          : "none",
        followers,
        following: followingCount,
        achievements: unlocks,
        stats,
        recentCompleted: recentCompleted
          .map((r) => safeGame(r.game))
          .filter(Boolean),
        library: library.slice(0, 24).map((l) => ({
          game: safeGame(l.game),
          status: l.status,
          favorite: l.favorite,
        })),
        libraryTruncated: library.length > 24,
      },
    };
  });
  route("get", "/profiles/:username/library", false, async (db, req) => {
    const p = await db.socialProfile.findUnique({
      where: { username: input(username, req.params.username) },
    });
    if (!p) fail(404, "Profile not found.");
    await target(db, p.userId, req.user?.id);
    if (!p.shareLibrary && p.userId !== req.user?.id)
      fail(404, "Library is private.");
    const offset = input(
      z.coerce.number().int().min(0).max(100000).default(0),
      req.query.offset,
    );
    const rows = await db.libraryEntry.findMany({
      where: { userId: p.userId },
      select: { game: true, status: true, favorite: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: 25,
    });
    return {
      data: rows.slice(0, 24).map((r) => ({ ...r, game: safeGame(r.game) })),
      nextOffset: rows.length > 24 ? offset + 24 : null,
    };
  });
  route("get", "/profiles/:username/relationships", false, async (db, req) => {
    const p = await db.socialProfile.findUnique({
      where: { username: input(username, req.params.username) },
    });
    if (!p) fail(404, "Profile not found.");
    await target(db, p.userId, req.user?.id);
    const direction = input(
        z.enum(["followers", "following"]).default("followers"),
        req.query.direction,
      ),
      offset = input(
        z.coerce.number().int().min(0).max(100000).default(0),
        req.query.offset,
      ),
      blocked = await blockedIds(db, req.user?.id);
    const rows = await db.followEdge.findMany({
      where: {
        accepted: true,
        ...(direction === "followers"
          ? { followedId: p.userId, followerId: { notIn: blocked } }
          : { followerId: p.userId, followedId: { notIn: blocked } }),
      },
      include: {
        follower: { include: { socialProfile: true } },
        followed: { include: { socialProfile: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: 21,
    });
    return {
      data: rows
        .slice(0, 20)
        .map((r) =>
          direction === "followers"
            ? r.follower.socialProfile
            : r.followed.socialProfile,
        )
        .filter((r): r is SocialProfile => !!r)
        .map(profileCard),
      nextOffset: rows.length > 20 ? offset + 20 : null,
    };
  });
  route("post", "/follow/:id", true, async (db, req) => {
    const id = String(req.params.id),
      me = req.user!.id;
    await actor(db, me);
    if (id === me) fail(400, "You cannot follow yourself.");
    if ((await blockedIds(db, me)).includes(id)) fail(404, "User unavailable.");
    const p = await actor(db, id);
    const exists = await db.followEdge.findUnique({
      where: { followerId_followedId: { followerId: me, followedId: id } },
    });
    if (!exists) {
      await db.followEdge.create({
        data: {
          followerId: me,
          followedId: id,
          accepted: p.visibility === "public",
        },
      });
      await notify(
        db,
        id,
        "follow:" + me,
        p.visibility === "public" ? "follow" : "request",
        p.visibility === "public"
          ? "You have a new follower."
          : "You have a follow request.",
        me,
      );
    }
    return { accepted: exists?.accepted ?? p.visibility === "public" };
  });
  route("delete", "/follow/:id", true, async (db, req) => {
    await db.followEdge.deleteMany({
      where: { followerId: req.user!.id, followedId: String(req.params.id) },
    });
    await db.socialNotification.deleteMany({
      where: {
        userId: String(req.params.id),
        dedupe: "follow:" + req.user!.id,
      },
    });
  });
  route("get", "/requests", true, async (db, req) => {
    const blocked = await blockedIds(db, req.user!.id);
    const rows = await db.followEdge.findMany({
      where: {
        followedId: req.user!.id,
        accepted: false,
        followerId: { notIn: blocked },
      },
      include: { follower: { include: { socialProfile: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      data: rows.flatMap((r) =>
        r.follower.socialProfile ? [profileCard(r.follower.socialProfile)] : [],
      ),
    };
  });
  route("post", "/requests/:id", true, async (db, req) => {
    const { accept } = input(
        z.object({ accept: z.boolean() }).strict(),
        req.body,
      ),
      me = req.user!.id,
      id = String(req.params.id);
    if ((await blockedIds(db, me)).includes(id)) fail(404, "User unavailable.");
    if (accept)
      await db.followEdge.updateMany({
        where: { followedId: me, followerId: id, accepted: false },
        data: { accepted: true },
      });
    else
      await db.followEdge.deleteMany({
        where: { followedId: me, followerId: id, accepted: false },
      });
    await db.socialNotification.updateMany({
      where: { userId: me, dedupe: "follow:" + id },
      data: { readAt: new Date() },
    });
  });
  route("post", "/blocks/:id", true, async (db, req) => {
    const me = req.user!.id,
      id = String(req.params.id);
    if (id === me) fail(400, "You cannot block yourself.");
    if (!(await db.user.findUnique({ where: { id } })))
      fail(404, "User not found.");
    await db.blockEdge.createMany({
      data: [{ blockerId: me, blockedId: id }],
      skipDuplicates: true,
    });
    await db.followEdge.deleteMany({
      where: {
        OR: [
          { followerId: me, followedId: id },
          { followerId: id, followedId: me },
        ],
      },
    });
    await db.reviewLike.deleteMany({
      where: {
        OR: [
          { userId: me, review: { userId: id } },
          { userId: id, review: { userId: me } },
        ],
      },
    });
    await db.collectionFollow.deleteMany({
      where: {
        OR: [
          { userId: me, collection: { userId: id } },
          { userId: id, collection: { userId: me } },
        ],
      },
    });
    await db.socialNotification.deleteMany({
      where: {
        OR: [
          { userId: me, actorId: id },
          { userId: id, actorId: me },
        ],
      },
    });
  });
  route("get", "/blocks", true, async (db, req) => ({
    data: (
      await db.blockEdge.findMany({
        where: { blockerId: req.user!.id },
        include: { blocked: { include: { socialProfile: true } } },
        take: 500,
      })
    ).map((r) => ({
      userId: r.blockedId,
      profile: r.blocked.socialProfile
        ? profileCard(r.blocked.socialProfile)
        : null,
    })),
  }));
  route("delete", "/blocks/:id", true, async (db, req) => {
    await db.blockEdge.deleteMany({
      where: { blockerId: req.user!.id, blockedId: String(req.params.id) },
    });
  });
  route("get", "/feed", false, async (db, req) => {
    const p = pagination(req),
      mode = input(
        z.enum(["public", "following"]).default("public"),
        req.query.mode,
      ),
      viewer = req.user?.id;
    if (mode === "following" && !viewer)
      fail(401, "Sign in to see your following feed.");
    const owner = req.query.username
      ? await db.socialProfile.findUnique({
          where: { username: input(username, req.query.username) },
        })
      : null;
    if (req.query.username && !owner) fail(404, "Profile not found.");
    if (owner) await target(db, owner.userId, viewer);
    const users = await visibleUsers(db, viewer);
    const raw = await db.socialActivity.findMany({
      where: {
        AND: [p.after],
        ...(owner ? { userId: owner.userId } : {}),
        user: {
          AND: [
            users,
            ...(owner
              ? []
              : mode === "following"
                ? [
                    {
                      followsIn: {
                        some: { followerId: viewer, accepted: true },
                      },
                    },
                  ]
                : [{ socialProfile: { is: { visibility: "public" } } }]),
          ],
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: p.limit + 1,
    });
    const page = paged(raw, p.limit);
    const [profiles, reviews, collections, entries] = await Promise.all([
      db.socialProfile.findMany({
        where: { userId: { in: page.data.map((e) => e.userId) } },
      }),
      db.communityReview.findMany({
        where: {
          id: {
            in: page.data
              .filter((e) => e.kind === "review")
              .map((e) => e.entityId),
          },
          hidden: false,
        },
        select: { id: true, slug: true },
      }),
      db.publishedCollection.findMany({
        where: {
          id: {
            in: page.data
              .filter((e) => e.kind === "collection")
              .map((e) => e.entityId),
          },
          visibility: "public",
        },
        select: { id: true },
      }),
      db.libraryEntry.findMany({
        where: {
          OR: page.data
            .filter((e) => ["added", "completed", "favorite"].includes(e.kind))
            .map((e) => ({ userId: e.userId, slug: e.entityId })),
        },
        select: { userId: true, slug: true, status: true, favorite: true },
      }),
    ]);
    const profileMap = new Map(profiles.map((p) => [p.userId, p])),
      reviewMap = new Map(reviews.map((r) => [r.id, r])),
      collectionSet = new Set(collections.map((c) => c.id)),
      entryMap = new Map(entries.map((e) => [e.userId + ":" + e.slug, e]));
    const data = [];
    for (const e of page.data) {
      const profile = profileMap.get(e.userId);
      if (!profile) continue;
      let link = "/u/" + profile.username;
      if (e.kind === "review") {
        const r = reviewMap.get(e.entityId);
        if (!r) continue;
        link = "/games/" + r.slug;
      } else if (e.kind === "collection") {
        if (!collectionSet.has(e.entityId)) continue;
        link = "/community/collections/" + e.entityId;
      } else if (["added", "completed", "favorite"].includes(e.kind)) {
        const entry = entryMap.get(e.userId + ":" + e.entityId);
        if (
          !profile.shareLibrary ||
          !entry ||
          (e.kind === "favorite" && !entry.favorite) ||
          (e.kind === "completed" && entry.status !== "Completed")
        )
          continue;
        link = "/games/" + e.entityId;
      }
      data.push({ ...e, author: profileCard(profile), link });
    }
    return { ...page, data };
  });
  route("get", "/reviews", false, async (db, req) => {
    const p = pagination(req),
      sort = input(
        z.enum(["newest", "rating"]).default("newest"),
        req.query.sort,
      );
    const owner = req.query.username
      ? await db.socialProfile.findUnique({
          where: { username: input(username, req.query.username) },
        })
      : null;
    if (req.query.username && !owner) fail(404, "Profile not found.");
    const gameSlug = req.query.slug ? input(slug, req.query.slug) : undefined;
    const offset = input(
      z.coerce.number().int().min(0).max(100000).default(0),
      req.query.offset,
    );
    const rows = await db.communityReview.findMany({
      where: {
        hidden: false,
        ...(gameSlug ? { slug: gameSlug } : {}),
        ...(owner ? { userId: owner.userId } : {}),
        user: await visibleUsers(db, req.user?.id),
        ...(p.q
          ? {
              OR: [
                { title: { contains: literalSearch(p.q) } },
                { body: { contains: literalSearch(p.q) } },
              ],
            }
          : {}),
      },
      orderBy:
        sort === "rating"
          ? [{ rating: "desc" }, { createdAt: "desc" }, { id: "desc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: p.limit + 1,
    });
    return {
      data: await Promise.all(
        rows.slice(0, p.limit).map((r) => reviewDto(db, r, req.user?.id)),
      ),
      nextOffset: rows.length > p.limit ? offset + p.limit : null,
    };
  });
  route("post", "/reviews", true, async (db, req) => {
    const v = input(reviewSchema, req.body),
      me = req.user!.id;
    await actor(db, me);
    const { version, ...data } = v;
    const existing = await db.communityReview.findUnique({
      where: { userId_slug: { userId: me, slug: v.game.slug } },
    });
    if (existing)
      return { data: await reviewDto(db, existing, me), existing: true };
    const r = await db.communityReview.create({
      data: { ...data, userId: me, slug: v.game.slug },
    });
    await activity(db, me, "review", r.id, v.title);
    await awardAchievements(db, me);
    return { data: await reviewDto(db, r, me) };
  });
  route("patch", "/reviews/:id", true, async (db, req) => {
    const v = input(reviewSchema, req.body),
      { version, ...data } = v;
    const count = await db.communityReview.updateMany({
      where: {
        id: String(req.params.id),
        userId: req.user!.id,
        version,
        slug: v.game.slug,
        hidden: false,
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (!count.count)
      fail(409, "Review changed or is unavailable. Reload before editing.");
    await db.socialActivity.updateMany({
      where: {
        userId: req.user!.id,
        kind: "review",
        entityId: String(req.params.id),
      },
      data: { title: v.title },
    });
    return {
      data: await reviewDto(
        db,
        await db.communityReview.findUniqueOrThrow({
          where: { id: String(req.params.id) },
        }),
        req.user!.id,
      ),
    };
  });
  route("delete", "/reviews/:id", true, async (db, req) => {
    const version = input(
      z.coerce.number().int().nonnegative(),
      req.query.version,
    );
    const r = await db.communityReview.findFirst({
      where: { id: String(req.params.id), userId: req.user!.id },
    });
    if (!r) fail(404, "Review not found.");
    if (r.version !== version) fail(409, "Review changed. Reload first.");
    await db.communityReview.delete({ where: { id: r.id } });
    await db.socialActivity.deleteMany({
      where: { userId: req.user!.id, kind: "review", entityId: r.id },
    });
    await db.socialNotification.deleteMany({
      where: { entityId: r.id, kind: "like" },
    });
  });
  route("post", "/reviews/:id/like", true, async (db, req) => {
    const r = await db.communityReview.findFirst({
      where: { id: String(req.params.id), hidden: false },
    });
    if (!r) fail(404, "Review not found.");
    await actor(db, req.user!.id);
    await target(db, r.userId, req.user!.id);
    const created = await db.reviewLike.createMany({
      data: [{ userId: req.user!.id, reviewId: r.id }],
      skipDuplicates: true,
    });
    if (created.count && r.userId !== req.user!.id)
      await notify(
        db,
        r.userId,
        "like:" + r.id + ":" + req.user!.id,
        "like",
        "Someone liked your review.",
        req.user!.id,
        r.id,
      );
  });
  route("delete", "/reviews/:id/like", true, async (db, req) => {
    await db.reviewLike.deleteMany({
      where: { userId: req.user!.id, reviewId: String(req.params.id) },
    });
    await db.socialNotification.deleteMany({
      where: { dedupe: "like:" + String(req.params.id) + ":" + req.user!.id },
    });
  });
  route("post", "/reviews/:id/report", true, async (db, req) => {
    const { reason } = input(
      z.object({ reason: z.string().trim().min(3).max(1000) }).strict(),
      req.body,
    );
    const r = await db.communityReview.findFirst({
      where: { id: String(req.params.id), hidden: false },
    });
    if (!r) fail(404, "Review not found.");
    await target(db, r.userId, req.user!.id);
    await db.reviewReport.createMany({
      data: [{ userId: req.user!.id, reviewId: r.id, reason }],
      skipDuplicates: true,
    });
  });
  route("get", "/moderation/reports", true, async (db, req) => {
    const me = await db.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { role: true },
    });
    if (me.role !== "ADMIN") fail(403, "Administrator access required.");
    return {
      data: await db.reviewReport.findMany({
        where: { status: "open" },
        include: { review: true },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
    };
  });
  route("post", "/moderation/reports/:id", true, async (db, req) => {
    if (
      (
        await db.user.findUniqueOrThrow({
          where: { id: req.user!.id },
          select: { role: true },
        })
      ).role !== "ADMIN"
    )
      fail(403, "Administrator access required.");
    const { hide } = input(z.object({ hide: z.boolean() }).strict(), req.body),
      r = await db.reviewReport.findUnique({
        where: { id: String(req.params.id) },
      });
    if (!r) fail(404, "Report not found.");
    if (hide) {
      await db.communityReview.update({
        where: { id: r.reviewId },
        data: { hidden: true, version: { increment: 1 } },
      });
      await db.socialActivity.deleteMany({
        where: { kind: "review", entityId: r.reviewId },
      });
      await db.socialNotification.deleteMany({
        where: { kind: "like", entityId: r.reviewId },
      });
    }
    await db.reviewReport.updateMany({
      where: { reviewId: r.reviewId, status: "open" },
      data: { status: "resolved" },
    });
  });
  route("get", "/collections", false, async (db, req) => {
    const p = pagination(req);
    const owner = req.query.username
      ? await db.socialProfile.findUnique({
          where: { username: input(username, req.query.username) },
        })
      : null;
    if (req.query.username && !owner) fail(404, "Profile not found.");
    const rows = await db.publishedCollection.findMany({
      where: {
        AND: [p.after],
        ...(owner ? { userId: owner.userId } : {}),
        ...(owner?.userId === req.user?.id && req.query.username
          ? {}
          : { visibility: "public" }),
        user: await visibleUsers(db, req.user?.id),
        ...(p.q
          ? {
              OR: [
                { name: { contains: literalSearch(p.q) } },
                { theme: { contains: literalSearch(p.q) } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: p.limit + 1,
    });
    const page = paged(rows, p.limit);
    return {
      ...page,
      data: await Promise.all(
        page.data.map(async (c) => ({
          ...c,
          author: profileCard(await actor(db, c.userId)),
          followers: await db.collectionFollow.count({
            where: { collectionId: c.id },
          }),
        })),
      ),
    };
  });
  route("get", "/collections/:id", false, async (db, req) => {
    const c = await db.publishedCollection.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!c || (c.visibility !== "public" && c.userId !== req.user?.id))
      fail(404, "Collection unavailable.");
    await target(db, c.userId, req.user?.id);
    return {
      data: {
        ...c,
        author: profileCard(await actor(db, c.userId)),
        followers: await db.collectionFollow.count({
          where: { collectionId: c.id },
        }),
        followed: !!(
          req.user &&
          (await db.collectionFollow.findUnique({
            where: {
              userId_collectionId: { userId: req.user.id, collectionId: c.id },
            },
          }))
        ),
      },
    };
  });
  route("post", "/collections", true, async (db, req) => {
    const v = input(collectionSchema, req.body);
    await actor(db, req.user!.id);
    const { version, id, ...data } = v;
    if (id) {
      const old = await db.publishedCollection.findUnique({ where: { id } });
      if (old) {
        if (old.userId !== req.user!.id)
          fail(409, "Collection ID is already in use.");
        return { data: old };
      }
    }
    const c = await db.publishedCollection.create({
      data: { ...data, ...(id ? { id } : {}), userId: req.user!.id },
    });
    if (c.visibility === "public")
      await activity(db, c.userId, "collection", c.id, c.name);
    await awardAchievements(db, c.userId);
    return { data: c };
  });
  route("patch", "/collections/:id", true, async (db, req) => {
    const v = input(collectionSchema, req.body),
      { version, id, ...data } = v;
    const c = await db.publishedCollection.updateMany({
      where: { id: String(req.params.id), userId: req.user!.id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (!c.count)
      fail(409, "Collection changed or is unavailable. Reload first.");
    if (v.visibility === "public") {
      await activity(
        db,
        req.user!.id,
        "collection",
        String(req.params.id),
        v.name,
      );
      await db.socialActivity.updateMany({
        where: {
          userId: req.user!.id,
          kind: "collection",
          entityId: String(req.params.id),
        },
        data: { title: v.name },
      });
    } else
      await db.socialActivity.deleteMany({
        where: {
          userId: req.user!.id,
          kind: "collection",
          entityId: String(req.params.id),
        },
      });
    await awardAchievements(db, req.user!.id);
    return {
      data: await db.publishedCollection.findUnique({
        where: { id: String(req.params.id) },
      }),
    };
  });
  route("delete", "/collections/:id", true, async (db, req) => {
    const version = input(
      z.coerce.number().int().nonnegative(),
      req.query.version,
    );
    const deleted = await db.publishedCollection.deleteMany({
      where: { id: String(req.params.id), userId: req.user!.id, version },
    });
    if (!deleted.count) fail(409, "Collection changed or is unavailable.");
    await db.socialActivity.deleteMany({
      where: {
        userId: req.user!.id,
        kind: "collection",
        entityId: String(req.params.id),
      },
    });
  });
  route("post", "/collections/:id/follow", true, async (db, req) => {
    const c = await db.publishedCollection.findFirst({
      where: { id: String(req.params.id), visibility: "public" },
    });
    if (!c) fail(404, "Collection unavailable.");
    await actor(db, req.user!.id);
    await target(db, c.userId, req.user!.id);
    await db.collectionFollow.createMany({
      data: [{ userId: req.user!.id, collectionId: c.id }],
      skipDuplicates: true,
    });
  });
  route("delete", "/collections/:id/follow", true, async (db, req) => {
    await db.collectionFollow.deleteMany({
      where: { userId: req.user!.id, collectionId: String(req.params.id) },
    });
  });
  route("get", "/achievements", true, async (db, req) => ({
    data: await awardAchievements(db, req.user!.id),
  }));
  route("get", "/notifications", true, async (db, req) => {
    const p = pagination(req),
      blocked = await blockedIds(db, req.user!.id),
      where = {
        userId: req.user!.id,
        OR: [{ actorId: null }, { actorId: { notIn: blocked } }],
      };
    const rows = await db.socialNotification.findMany({
      where: { ...where, AND: [p.after] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: p.limit + 1,
    });
    return {
      ...paged(rows, p.limit),
      unread: await db.socialNotification.count({
        where: { ...where, readAt: null },
      }),
    };
  });
  route("post", "/notifications/read", true, async (db, req) => {
    const { id } = input(
      z.object({ id: z.string().max(191).optional() }).strict(),
      req.body,
    );
    await db.socialNotification.updateMany({
      where: { userId: req.user!.id, ...(id ? { id } : {}), readAt: null },
      data: { readAt: new Date() },
    });
  });
  return router;
}
