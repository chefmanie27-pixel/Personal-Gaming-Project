import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { requireAuth, type AuthRequest } from "./auth.js";
import { config } from "./config.js";
import { authRateLimit } from "./rateLimit.js";
import { snapshot } from "./library.js";
import { awardAchievements } from "./social.js";
export const ownedResponse = z.object({
  response: z.object({
    game_count: z.number().int().nonnegative().optional(),
    games: z
      .array(
        z.object({
          appid: z.number().int().positive().max(2147483647),
          name: z.string().min(1).max(500),
          playtime_forever: z
            .number()
            .int()
            .nonnegative()
            .max(100000000)
            .default(0),
        }),
      )
      .max(20000)
      .optional(),
  }),
});
export function parseOwned(value: unknown) {
  const parsed = ownedResponse.safeParse(value);
  if (!parsed.success)
    throw new Error("Steam returned an incomplete library response.");
  const r = parsed.data.response;
  if (!r.games && r.game_count !== 0)
    throw new Error("Steam game details are private or unavailable.");
  if (r.games && r.game_count !== undefined && r.games.length !== r.game_count)
    throw new Error("Steam returned an incomplete library response.");
  return [...new Map((r.games ?? []).map((g) => [g.appid, g])).values()];
}
export async function steamRequest(
  path: string,
  params: Record<string, string>,
  fetcher: typeof fetch = fetch,
) {
  if (!config.STEAM_WEB_API_KEY)
    throw new Error("Steam Web API key is not configured on this server.");
  const u = new URL("https://api.steampowered.com/" + path);
  u.search = new URLSearchParams({
    ...params,
    key: config.STEAM_WEB_API_KEY,
  }).toString();
  const r = await fetcher(u, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("Steam is temporarily unavailable.");
  return r.json();
}
export const steamLibrary = Router();
steamLibrary.use(requireAuth);
steamLibrary.use((_q, r, n) => {
  r.setHeader("Cache-Control", "no-store");
  n();
});
steamLibrary.get("/", async (req: AuthRequest, res, next) => {
  try {
    const id = req.user!.id;
    let c = await prisma.steamConnection.findUnique({ where: { userId: id } });
    return res.json({
      data: c
        ? {
            steamId: c.steamId,
            status: c.status,
            processed: c.processed,
            lastSyncedAt: c.lastSyncedAt,
          }
        : null,
      configured: !!config.STEAM_WEB_API_KEY,
    });
  } catch (e) {
    next(e);
  }
});
steamLibrary.delete("/", async (req: AuthRequest, res, next) => {
  try {
    const c = await prisma.steamConnection.findUnique({
      where: { userId: req.user!.id },
    });
    if (c?.leaseUntil && c.leaseUntil > new Date())
      return res
        .status(409)
        .json({ error: "Synchronization is running. Retry shortly." });
    await prisma.steamConnection.deleteMany({
      where: { userId: req.user!.id },
    });
    return res.json({ success: true });
  } catch (e) {
    next(e);
  }
});
steamLibrary.post(
  "/sync",
  authRateLimit(5, 60000),
  async (req: AuthRequest, res, next) => {
    const userId = req.user!.id;
    let lease: Date | undefined;
    try {
      if (!config.STEAM_WEB_API_KEY)
        return res.status(503).json({
          error: "Steam imports require STEAM_WEB_API_KEY on the server.",
        });
      const c = await prisma.steamConnection.findUnique({ where: { userId } });
      if (!c) return res.status(409).json({ error: "Link Steam first." });
      lease = new Date(Date.now() + 120000);
      const claimed = await prisma.steamConnection.updateMany({
        where: {
          userId,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: { leaseUntil: lease, status: "running" },
      });
      if (!claimed.count)
        return res
          .status(409)
          .json({ error: "Synchronization is already running." });
      const games = parseOwned(
        await steamRequest("IPlayerService/GetOwnedGames/v1/", {
          steamid: c.steamId,
          include_appinfo: "1",
          include_played_free_games: "1",
        }),
      );
      // Only create missing entries. Existing manually maintained values are never updated.
      let added = 0;
      for (let start = 0; start < games.length; start += 100) {
        const batch = games.slice(start, start + 100);
        added += await prisma.$transaction(
          async (db) => {
            const current = await db.steamConnection.findFirst({
              where: { userId, steamId: c.steamId, leaseUntil: lease },
            });
            if (!current)
              throw new Error("Connection changed. Retry synchronization.");
            const created = await db.libraryEntry.createMany({
              data: batch.map((g) => ({
                userId,
                slug: "steam-" + g.appid,
                game: snapshot.parse({
                  id: "steam-" + g.appid,
                  slug: "steam-" + g.appid,
                  title: g.name,
                  store: "Steam",
                  cover:
                    "https://cdn.akamai.steamstatic.com/steam/apps/" +
                    g.appid +
                    "/library_600x900_2x.jpg",
                  platforms: ["PC"],
                }),
                notes: "",
                hours: Math.round((g.playtime_forever / 60) * 100) / 100,
                status: "Want to Play",
              })),
              skipDuplicates: true,
            });
            for (const g of batch)
              await db.steamGameSnapshot.upsert({
                where: { userId_appId: { userId, appId: g.appid } },
                create: { userId, appId: g.appid, minutes: g.playtime_forever },
                update: { minutes: g.playtime_forever, fetchedAt: new Date() },
              });
            return created.count;
          },
          { timeout: 20000 },
        );
      }
      await prisma.$transaction(async (db) => {
        await db.steamConnection.updateMany({
          where: { userId, leaseUntil: lease },
          data: {
            status: "succeeded",
            leaseUntil: null,
            processed: games.length,
            lastSyncedAt: new Date(),
          },
        });
        if (await db.socialProfile.findUnique({ where: { userId } }))
          await awardAchievements(db, userId);
      });
      return res.json({
        added,
        processed: games.length,
        preserved: games.length - added,
      });
    } catch (e) {
      if (lease)
        await prisma.steamConnection
          .updateMany({
            where: { userId, leaseUntil: lease },
            data: { status: "failed", leaseUntil: null },
          })
          .catch(() => {});
      return res.status(502).json({
        error:
          e instanceof Error &&
          [
            "Steam returned an incomplete library response.",
            "Steam game details are private or unavailable.",
            "Steam is temporarily unavailable.",
            "Connection changed. Retry synchronization.",
          ].includes(e.message)
            ? e.message
            : "Steam synchronization failed. Existing data is preserved; retry safely.",
      });
    }
  },
);
steamLibrary.post(
  "/achievements/:appId",
  authRateLimit(20, 60000),
  async (req: AuthRequest, res, next) => {
    try {
      const appId = z.coerce
        .number()
        .int()
        .positive()
        .max(2147483647)
        .safeParse(req.params.appId);
      if (!appId.success)
        return res.status(400).json({ error: "Invalid Steam app ID." });
      if (!config.STEAM_WEB_API_KEY)
        return res
          .status(503)
          .json({ error: "Steam Web API key is not configured." });
      const c = await prisma.steamConnection.findUnique({
        where: { userId: req.user!.id },
      });
      if (!c) return res.status(409).json({ error: "Link Steam first." });
      const saved = await prisma.steamGameSnapshot.findUnique({
        where: { userId_appId: { userId: c.userId, appId: appId.data } },
      });
      if (!saved)
        return res
          .status(404)
          .json({ error: "Synchronize this owned Steam game first." });
      const raw = await steamRequest(
        "ISteamUserStats/GetPlayerAchievements/v1/",
        { steamid: c.steamId, appid: String(appId.data), l: "english" },
      );
      const parsed = z
        .object({
          playerstats: z.object({
            success: z.literal(true),
            achievements: z
              .array(
                z.object({
                  apiname: z.string().max(300),
                  achieved: z.union([z.literal(0), z.literal(1)]),
                  unlocktime: z.number().int().nonnegative(),
                  name: z.string().max(500).optional(),
                  description: z.string().max(2000).optional(),
                }),
              )
              .max(10000),
          }),
        })
        .safeParse(raw);
      if (!parsed.success)
        return res.status(502).json({
          error:
            "Achievements are private, unsupported, or unavailable for this game.",
        });
      await prisma.steamGameSnapshot.update({
        where: { userId_appId: { userId: c.userId, appId: appId.data } },
        data: {
          achievements: parsed.data.playerstats.achievements,
          fetchedAt: new Date(),
        },
      });
      return res.json({ data: parsed.data.playerstats.achievements });
    } catch (e) {
      return res
        .status(502)
        .json({ error: "Steam achievements could not be retrieved." });
    }
  },
);
