import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { requireAuth, type AuthRequest } from "./auth.js";
import { authRateLimit } from "./rateLimit.js";
import { slug } from "./library.js";
import { steamGame, type SteamGame } from "./integrations/steam.js";
import { publicGame } from "./integrations/publicStores.js";
export const priceSources = {
  steam: {
    name: "Steam",
    website: "https://store.steampowered.com",
    platform: "PC",
  },
  gog: { name: "GOG", website: "https://www.gog.com", platform: "PC" },
  epic: {
    name: "Epic Games Store",
    website: "https://store.epicgames.com",
    platform: "PC",
  },
  xbox: {
    name: "Xbox Console",
    website: "https://www.xbox.com",
    platform: "Xbox",
  },
  xboxpc: { name: "Xbox PC", website: "https://www.xbox.com", platform: "PC" },
  nintendo: {
    name: "Nintendo",
    website: "https://www.nintendo.com",
    platform: "Nintendo",
  },
} as const;
export function priceSource(value: string) {
  const key = value.split("-")[0] as keyof typeof priceSources;
  return Object.hasOwn(priceSources, key)
    ? { key, ...priceSources[key] }
    : null;
}
export function verifiedObservation(
  game: SteamGame,
  requested: string,
  now = new Date(),
) {
  const source = priceSource(requested);
  if (!source || game.slug !== requested || game.sourceType !== source.key)
    throw new Error("Provider identity mismatch");
  if (
    !z
      .string()
      .url()
      .refine((v) => v.startsWith("https:"))
      .safeParse(game.storeUrl).success
  )
    throw new Error("Missing secure store URL");
  const observedAt = new Date(game.observedAt);
  const age = now.getTime() - observedAt.getTime();
  const usable =
    game.status === "released" &&
    game.price !== null &&
    Number.isFinite(game.price) &&
    game.price >= 0 &&
    Number.isFinite(age) &&
    age >= -60000 &&
    age <= 30 * 60000;
  return {
    source,
    externalId: requested.slice(source.key.length + 1),
    observedAt,
    usable,
  };
}
export async function reconcileObservation(game: SteamGame, requested: string) {
  const verified = verifiedObservation(game, requested),
    { source, externalId, observedAt, usable } = verified;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (db) => {
          const old = await db.externalGameId.findUnique({
            where: {
              provider_providerId: {
                provider: source.key,
                providerId: externalId,
              },
            },
            include: { game: { select: { slug: true } } },
          });
          if (
            old &&
            (old.providerId !== externalId || old.game.slug !== requested)
          )
            throw Object.assign(
              new Error(
                "This provider ID already belongs to a different canonical record. No records were merged.",
              ),
              { status: 409 },
            );
          const data = {
            title: game.title,
            description: game.description,
            cover: game.cover,
            hero: game.hero,
            tagline: game.tagline,
            developer: game.developer,
            publisher: game.publisher,
            score: game.score,
          };
          const canonical = await db.game.upsert({
            where: { slug: requested },
            create: { slug: requested, ...data },
            update: data,
          });
          await db.externalGameId.upsert({
            where: {
              provider_providerId: {
                provider: source.key,
                providerId: externalId,
              },
            },
            create: {
              provider: source.key,
              providerId: externalId,
              gameId: canonical.id,
            },
            update: {},
          });
          const store = await db.store.upsert({
            where: { name: source.name },
            create: { name: source.name, website: source.website },
            update: {},
          });
          const listing = await db.storeListing.upsert({
            where: { storeId_externalId: { storeId: store.id, externalId } },
            create: {
              storeId: store.id,
              externalId,
              gameId: canonical.id,
              platform: source.platform,
              purchaseUrl: game.storeUrl,
            },
            update: { purchaseUrl: game.storeUrl },
          });
          if (
            listing.gameId !== canonical.id ||
            listing.platform !== source.platform
          )
            throw Object.assign(
              new Error(
                "Listing identity conflicts with this game or platform.",
              ),
              { status: 409 },
            );
          let recorded = false;
          if (usable) {
            const duplicate = await db.regionalPrice.findFirst({
              where: {
                listingId: listing.id,
                region: "ZA",
                currency: "ZAR",
                observedAt,
                sourceType: source.key,
              },
            });
            if (!duplicate) {
              const original =
                game.originalPrice !== undefined &&
                Number.isFinite(game.originalPrice) &&
                game.originalPrice > game.price!
                  ? game.originalPrice
                  : null;
              await db.regionalPrice.create({
                data: {
                  listingId: listing.id,
                  region: "ZA",
                  currency: "ZAR",
                  amount: game.price!,
                  originalAmount: original,
                  discount: original
                    ? Math.round((1 - game.price! / original) * 10000) / 100
                    : null,
                  sourceType: source.key,
                  observedAt,
                },
              });
              recorded = true;
            }
          }
          return {
            gameSlug: canonical.slug,
            listingId: listing.id,
            recorded,
            priceAvailable: usable,
            region: "ZA",
            currency: "ZAR",
            source: source.name,
            observedAt: usable ? observedAt.toISOString() : null,
          };
        },
        { isolationLevel: "Serializable", timeout: 15000 },
      );
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
  throw new Error("Observation could not be recorded.");
}
export const observationRouter = Router();
observationRouter.post(
  "/:slug/observe",
  requireAuth,
  authRateLimit(30, 60000),
  async (req: AuthRequest, res, next) => {
    const parsed = slug.safeParse(req.params.slug);
    if (!parsed.success || !priceSource(parsed.data))
      return res.status(400).json({
        error:
          "This storefront does not provide supported regional purchase observations.",
      });
    try {
      if (
        !(await prisma.user.findUnique({
          where: { id: req.user!.id },
          select: { id: true },
        }))
      )
        return res.status(401).json({ error: "Account no longer exists." });
      const game = parsed.data.startsWith("steam-")
        ? await steamGame(parsed.data)
        : await publicGame(parsed.data);
      if (!game) return res.status(404).json({ error: "Game not found." });
      return res.json({ data: await reconcileObservation(game, parsed.data) });
    } catch (e) {
      if (e && typeof e === "object" && "status" in e && e.status === 409)
        return res
          .status(409)
          .json({
            error:
              e instanceof Error ? e.message : "Canonical identity conflict.",
          });
      return next(e);
    }
  },
);
