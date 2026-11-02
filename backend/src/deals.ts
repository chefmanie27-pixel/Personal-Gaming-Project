import { z } from "zod";
import { steamPage, type SteamGame } from "./integrations/steam.js";
import { publicCatalogue } from "./integrations/publicStores.js";
export const dealSources = [
  "steam",
  "gog",
  "xbox",
  "xboxpc",
  "nintendo",
  "epic",
] as const;
export type DealSource = (typeof dealSources)[number];
const names: Record<DealSource, string> = {
  steam: "Steam",
  gog: "GOG",
  xbox: "Xbox Console",
  xboxpc: "Xbox PC",
  nintendo: "Nintendo",
  epic: "Epic Games Store",
};
const cursorSchema = z
  .object({
    steam: z.number().int().min(0).max(10000).optional(),
    gog: z.number().int().min(0).max(10000).optional(),
    xbox: z.number().int().min(0).max(10000).optional(),
    xboxpc: z.number().int().min(0).max(10000).optional(),
    nintendo: z.number().int().min(0).max(10000).optional(),
    epic: z.number().int().min(0).max(10000).optional(),
  })
  .strict();
export const dealsQuerySchema = z.object({
  budget: z.coerce.number().finite().positive().optional(),
  source: z.enum(["all", ...dealSources]).default("all"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z
    .string()
    .max(1000)
    .transform((text, ctx) => {
      try {
        return cursorSchema.parse(JSON.parse(text));
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid storefront cursor",
        });
        return z.NEVER;
      }
    })
    .optional(),
});
type Options = z.infer<typeof dealsQuerySchema>;
type Page = { data: SteamGame[]; meta: { hasMore: boolean; scope?: string } };
export type DealLoader = (
  source: DealSource,
  page: number,
  limit: number,
) => Promise<Page>;
const load: DealLoader = async (source, page, limit) => {
  if (source === "steam") {
    const result = await steamPage("", page, limit, "featured", true);
    return {
      data: result.data,
      meta: {
        hasMore: result.hasMore,
        scope: "Steam sale catalogue, paginated; confirmed ZAR discounts only.",
      },
    };
  }
  return publicCatalogue(source, {
    search: "",
    page,
    limit,
    sort: "featured",
    genre: "",
    platform: "",
    dealsOnly: true,
  });
};
export async function getDeals(options: Options, loader: DealLoader = load) {
  const selected =
    options.source === "all" ? [...dealSources] : [options.source];
  const nextCursor: Partial<Record<DealSource, number>> = {};
  const results = await Promise.all(
    selected.map(async (source) => {
      const page = options.cursor?.[source] ?? options.page;
      if (page === 0) {
        nextCursor[source] = 0;
        return {
          id: source,
          name: names[source],
          page: 0,
          hasMore: false,
          scope: "No further source pages.",
          error: null,
          data: [] as SteamGame[],
        };
      }
      try {
        const result = await loader(source, page, options.limit);
        const more = result.meta.hasMore && page < 10000;
        nextCursor[source] = more ? page + 1 : 0;
        return {
          id: source,
          name: names[source],
          page,
          hasMore: more,
          scope:
            result.meta.scope ??
            "Catalogue pages checked for confirmed discounts.",
          error: null,
          data: result.data,
        };
      } catch {
        nextCursor[source] = page;
        return {
          id: source,
          name: names[source],
          page,
          hasMore: true,
          scope: "",
          error:
            "This storefront could not be loaded. Retry to continue from the same page.",
          data: [] as SteamGame[],
        };
      }
    }),
  );
  const now = Date.now();
  const data = [
    ...new Map(
      results
        .flatMap((r) => r.data)
        .filter(
          (game) =>
            game.status !== "upcoming" &&
            (!game.releaseDate ||
              !Number.isFinite(Date.parse(game.releaseDate)) ||
              Date.parse(game.releaseDate) <= now) &&
            game.price !== null &&
            Number.isFinite(game.price) &&
            game.price >= 0 &&
            game.originalPrice !== undefined &&
            Number.isFinite(game.originalPrice) &&
            game.originalPrice > game.price &&
            (options.budget === undefined || game.price <= options.budget),
        )
        .map((game) => [
          game.slug,
          {
            ...game,
            discount: Math.round((1 - game.price! / game.originalPrice!) * 100),
          },
        ]),
    ).values(),
  ].sort(
    (a, b) =>
      b.discount - a.discount ||
      a.price! - b.price! ||
      a.title.localeCompare(b.title),
  );
  return {
    data,
    meta: {
      currency: "ZAR",
      sourceType: options.source,
      page: options.page,
      limit: options.limit,
      hasMore: results.some((r) => r.hasMore),
      nextCursor,
      partial: results.some((r) => r.error !== null),
      sources: results.map(({ data, ...status }) => status),
      updatedAt:
        data
          .map((g) => g.observedAt)
          .filter(Boolean)
          .sort()[0] ?? null,
      scope:
        "Discounts found in the checked storefront pages; load more to search further. Sorting is across loaded deals, not the entire market.",
    },
  };
}
