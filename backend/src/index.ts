import "dotenv/config";
import { rawgCatalogue, rawgDetail } from "./integrations/storefronts.js";
import { publicCatalogue, publicGame } from "./integrations/publicStores.js";
import { catalogueSources } from "./integrations/sources.js";
import { getSubscriptions } from "./integrations/subscriptions.js";
import { gameRelated } from "./integrations/related.js";
import { steamAuth } from "./steamAuth.js";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { games } from "./data/games.js";
import { steamCatalogue, steamGame, steamPage } from "./integrations/steam.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import {
  hashPassword,
  issueToken,
  requireAuth,
  requireAdmin,
  verifyPassword,
  type AuthRequest,
} from "./auth.js";
import { evaluatePriceAlerts } from "./jobs/priceAlerts.js";
import { startScheduler } from "./jobs/scheduler.js";

const app = express();
const port = config.PORT;
app.use(cors({ origin: config.FRONTEND_ORIGIN }));
app.use(express.json());
app.use("/api/auth", steamAuth);

app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", service: "gamevault-api" }),
);

app.get("/api/sources", (_req, res) => res.json({ data: catalogueSources() }));

app.get("/api/subscriptions", async (_req, res, next) => {
  try {
    return res.json(await getSubscriptions());
  } catch (error) {
    return next(error);
  }
});

const filters = z.object({
  search: z.string().max(200).default(""),
  genre: z.string().max(100).default(""),
  platform: z.string().default(""),
  source: z
    .enum([
      "steam",
      "rawg",
      "gog",
      "xbox",
      "xboxpc",
      "nintendo",
      "epic",
      "playstation",
    ])
    .default("steam"),
  sort: z.enum(["featured", "score", "newest", "price"]).default("featured"),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});
app.get("/api/games", async (req, res) => {
  const parsed = filters.safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid catalogue filters" });
  try {
    const f = parsed.data;
    const selected = catalogueSources().find((s) => s.id === f.source)!;
    if (
      (f.sort === "score" && !selected.scores) ||
      (f.sort === "price" && !selected.prices) ||
      (["xbox", "xboxpc"].includes(f.source) && f.sort === "newest")
    )
      return res.status(400).json({
        error:
          "This sorting option is not available for the selected storefront.",
      });
    if (f.source === "playstation")
      return res.status(503).json({
        error:
          "PlayStation live catalogue is unavailable. Open the official store to browse.",
        storeUrl: "https://store.playstation.com/en-za/pages/browse",
      });
    if (f.source !== "steam" && f.source !== "rawg")
      return res.json(await publicCatalogue(f.source, f));
    if (f.source === "rawg") {
      if (!config.RAWG_API_KEY)
        return res.status(503).json({
          error: "PC and console discovery is not enabled on this server yet.",
        });
      return res.json(await rawgCatalogue(f));
    }
    const result = await steamPage(f.search, f.page, f.limit, f.sort);
    const data = result.data.filter(
      (g) =>
        (!f.genre || g.genres.includes(f.genre)) &&
        (!f.platform || g.platforms.includes(f.platform)) &&
        (f.minScore === undefined ||
          (g.score !== null && g.score >= f.minScore)) &&
        (f.maxPrice === undefined ||
          (g.price !== null && g.price <= f.maxPrice)),
    );
    return res.json({
      data,
      meta: {
        total: result.total,
        page: f.page,
        limit: f.limit,
        pages: Math.ceil(result.total / f.limit),
        hasMore: result.hasMore,
        scope: "Steam results; filters apply to each loaded page",
      },
    });
  } catch {
    return res
      .status(502)
      .json({ error: "Storefront data is unavailable. Please retry." });
  }
});
app.get("/api/games/:slug/related", async (req, res) => {
  const parsed = z
    .object({
      kind: z.enum(["editions", "dlc"]).default("editions"),
      page: z.coerce.number().int().min(1).max(10000).default(1),
      limit: z.coerce.number().int().min(1).max(20).default(8),
    })
    .safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid related-product filters" });
  try {
    const f = parsed.data;
    const result = await gameRelated(
      String(req.params.slug),
      f.kind,
      f.page,
      f.limit,
    );
    return result
      ? res.json(result)
      : res.status(404).json({ error: "Game not found" });
  } catch {
    return res
      .status(502)
      .json({ error: "Related products could not be loaded. Please retry." });
  }
});
app.get("/api/games/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug);
    const game = slug.startsWith("rawg-")
      ? await rawgDetail(slug)
      : slug.startsWith("steam-")
        ? await steamGame(slug)
        : await publicGame(slug);
    return game
      ? res.json({ data: game })
      : res.status(404).json({ error: "Game not found" });
  } catch {
    return res
      .status(502)
      .json({ error: "Storefront data is unavailable. Please retry." });
  }
});
app.get("/api/deals", async (req, res) => {
  const budget = z.coerce
    .number()
    .positive()
    .optional()
    .safeParse(req.query.budget);
  if (!budget.success)
    return res.status(400).json({ error: "Budget must be positive" });
  try {
    const catalogue = await steamCatalogue();
    const deals = catalogue
      .filter(
        (g) =>
          g.price !== null &&
          g.originalPrice &&
          (budget.data === undefined || g.price <= budget.data),
      )
      .map((g) => ({
        ...g,
        discount: Math.round((1 - g.price! / g.originalPrice!) * 100),
      }))
      .sort((a, b) => b.discount - a.discount);
    return res.json({
      data: deals,
      meta: {
        sourceType: "steam",
        currency: "ZAR",
        updatedAt: catalogue[0]?.observedAt,
      },
    });
  } catch {
    return res
      .status(502)
      .json({ error: "Steam is unavailable. Please try again shortly." });
  }
});
app.get("/api/games/:slug/price-history", async (req, res) => {
  if (!/^steam-[1-9][0-9]{0,9}$/.test(String(req.params.slug)))
    return res.status(404).json({ error: "Game not found" });
  try {
    const stored = await prisma.regionalPrice.findMany({
      where: {
        listing: { game: { slug: String(req.params.slug) } },
        region: "ZA",
        currency: "ZAR",
        sourceType: { not: "mock" },
      },
      orderBy: { observedAt: "asc" },
      select: { amount: true, observedAt: true, sourceType: true },
    });
    return res.json({
      data: stored.map((p) => ({
        amount: Number(p.amount),
        observedAt: p.observedAt,
        sourceType: p.sourceType,
      })),
      meta: { currency: "ZAR", sourceType: "observed" },
    });
  } catch {
    return res.json({
      data: [],
      meta: { currency: "ZAR", sourceType: "unavailable" },
    });
  }
});

const credentials = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase())
    .refine(
      (value) => !value.endsWith("@steam.gamevault.invalid"),
      "Use Steam to sign in with this account",
    ),
  password: z.string().min(8).max(128),
});

app.post("/api/auth/register", async (req, res, next) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: "Email and password are required",
      details: parsed.error.flatten(),
    });
  try {
    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (existing)
      return res
        .status(409)
        .json({ error: "An account with that email already exists" });
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
      },
      select: { id: true, email: true, role: true },
    });
    return res.status(201).json({ data: { user, token: issueToken(user) } });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Email and password are required" });
  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (
      !user ||
      !(await verifyPassword(parsed.data.password, user.passwordHash))
    )
      return res.status(401).json({ error: "Invalid email or password" });
    return res.json({
      data: {
        user: { id: user.id, email: user.email, role: user.role },
        token: issueToken(user),
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, role: true },
    });
    return user
      ? res.json({ data: user })
      : res.status(404).json({ error: "User not found" });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/wishlist", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const items = await prisma.wishlistItem.findMany({
      where: { userId: req.user!.id },
      include: { game: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ data: items });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/wishlist", requireAuth, async (req: AuthRequest, res, next) => {
  const parsed = z
    .object({
      gameSlug: z.string().min(1),
      target: z.number().positive().optional(),
      currency: z.string().length(3).default("ZAR"),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: "Invalid wishlist item",
      details: parsed.error.flatten(),
    });
  try {
    const game = await prisma.game.findUnique({
      where: { slug: parsed.data.gameSlug },
    });
    if (!game)
      return res
        .status(404)
        .json({ error: "Game is not available in the database yet" });
    const item = await prisma.wishlistItem.upsert({
      where: { userId_gameId: { userId: req.user!.id, gameId: game.id } },
      create: {
        userId: req.user!.id,
        gameId: game.id,
        target: parsed.data.target,
        currency: parsed.data.currency,
      },
      update: { target: parsed.data.target, currency: parsed.data.currency },
      include: { game: true },
    });
    return res.status(201).json({ data: item });
  } catch (error) {
    return next(error);
  }
});

app.delete(
  "/api/wishlist/:gameId",
  requireAuth,
  async (req: AuthRequest, res, next) => {
    try {
      await prisma.wishlistItem.delete({
        where: {
          userId_gameId: {
            userId: req.user!.id,
            gameId: String(req.params.gameId),
          },
        },
      });
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);

app.get("/api/alerts", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const alerts = await prisma.priceAlert.findMany({
      where: { userId: req.user!.id },
      include: {
        listing: {
          include: {
            game: true,
            store: true,
            prices: { orderBy: { observedAt: "desc" }, take: 1 },
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

app.post("/api/alerts", requireAuth, async (req: AuthRequest, res, next) => {
  const parsed = z
    .object({
      gameSlug: z.string().min(1),
      target: z.number().positive(),
      currency: z.string().length(3).default("ZAR"),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error:
        "A game, positive target price, and three-letter currency are required",
      details: parsed.error.flatten(),
    });
  try {
    const listing = await prisma.storeListing.findFirst({
      where: {
        game: { slug: parsed.data.gameSlug },
        prices: { some: { currency: parsed.data.currency, region: "ZA" } },
      },
    });
    if (!listing)
      return res.status(404).json({
        error: "No regional price listing is available for this game yet",
      });
    const alert = await prisma.priceAlert.create({
      data: {
        userId: req.user!.id,
        listingId: listing.id,
        target: parsed.data.target,
        currency: parsed.data.currency,
      },
      include: { listing: { include: { game: true, store: true } } },
    });
    return res.status(201).json({ data: alert });
  } catch (error) {
    return next(error);
  }
});

app.patch(
  "/api/alerts/:id",
  requireAuth,
  async (req: AuthRequest, res, next) => {
    const parsed = z
      .object({
        active: z.boolean().optional(),
        target: z.number().positive().optional(),
      })
      .refine(
        (value) => value.active !== undefined || value.target !== undefined,
      )
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Provide an active state or positive target price" });
    try {
      const result = await prisma.priceAlert.updateMany({
        where: { id: String(req.params.id), userId: req.user!.id },
        data: parsed.data,
      });
      return result.count
        ? res.status(204).send()
        : res.status(404).json({ error: "Alert not found" });
    } catch (error) {
      return next(error);
    }
  },
);

app.delete(
  "/api/alerts/:id",
  requireAuth,
  async (req: AuthRequest, res, next) => {
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
  },
);

app.get(
  "/api/admin/stats",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const [users, catalogueGames, reviews, listings, prices, failedSyncs] =
        await Promise.all([
          prisma.user.count(),
          prisma.game.count(),
          prisma.review.count(),
          prisma.storeListing.count(),
          prisma.regionalPrice.count(),
          prisma.syncLog.count({ where: { status: "FAILED" } }),
        ]);
      return res.json({
        data: {
          users,
          games: catalogueGames,
          reviews,
          listings,
          prices,
          failedSyncs,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

app.get(
  "/api/admin/sync-logs",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const logs = await prisma.syncLog.findMany({
        orderBy: { startedAt: "desc" },
        take: 20,
      });
      return res.json({ data: logs });
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/api/admin/sync",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    const parsed = z
      .object({
        provider: z.enum(["mock", "rawg", "igdb", "steam"]),
        job: z.enum(["metadata", "reviews", "prices"]),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Invalid synchronization request",
        details: parsed.error.flatten(),
      });
    try {
      const log = await prisma.syncLog.create({
        data: {
          provider: parsed.data.provider,
          job: parsed.data.job,
          status: "RUNNING",
        },
      });
      if (parsed.data.provider !== "mock") {
        const failed = await prisma.syncLog.update({
          where: { id: log.id },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            error:
              "Provider adapter is not configured. Confirm credentials and terms before enabling it.",
          },
        });
        return res
          .status(409)
          .json({ error: "Provider is not configured", data: failed });
      }
      const completed = await prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          processed: games.length,
        },
      });
      return res.status(201).json({ data: completed });
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/api/admin/alerts/evaluate",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      return res.json({ data: await evaluatePriceAlerts() });
    } catch (error) {
      return next(error);
    }
  },
);

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An unexpected server error occurred" });
  },
);

app.listen(port, () => {
  startScheduler();
  console.log(`GameVault API listening on http://localhost:${port}`);
});
