import { microsoftPrice, nintendoPrices } from "./regionalPrices.js";
import {
  gogRequirements,
  microsoftRequirements,
  type SystemRequirements,
} from "./requirements.js";
import { z } from "zod";
import type { SteamGame } from "./steam.js";

export interface StoreFilters {
  search: string;
  page: number;
  limit: number;
  sort: string;
  genre: string;
  platform: string;
  minScore?: number;
  maxPrice?: number;
  dealsOnly?: boolean;
}
export type PublicSource = "gog" | "xbox" | "xboxpc" | "nintendo" | "epic";
class StoreHttpError extends Error {
  constructor(readonly status: number) {
    super("Store returned " + status);
  }
}
const cache = new Map<
  string,
  { expires: number; value: unknown; observedAt: string }
>();
const pending = new Map<
  string,
  Promise<{ value: unknown; observedAt: string }>
>();
async function request(url: string) {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit;
  const active = pending.get(url);
  if (active) return active;
  const work = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new StoreHttpError(response.status);
    const result = {
      value: (await response.json()) as unknown,
      observedAt: new Date().toISOString(),
    };
    if (cache.size >= 150) cache.delete(cache.keys().next().value!);
    cache.set(url, { ...result, expires: Date.now() + 300000 });
    return result;
  })();
  pending.set(url, work);
  try {
    return await work;
  } finally {
    pending.delete(url);
  }
}
const urlSchema = z
  .string()
  .url()
  .refine((v) => v.startsWith("https://"));
const money = z.object({ amount: z.string(), currency: z.string() });
const gogEntry = z.object({
  id: z.string().regex(/^\d+$/),
  slug: z.string(),
  title: z.string(),
  productType: z.string(),
  coverVertical: urlSchema.nullish(),
  coverHorizontal: urlSchema.nullish(),
  galaxyBackgroundImage: urlSchema.nullish(),
  releaseDate: z.string().optional(),
  developers: z.array(z.string()).optional(),
  publishers: z.array(z.string()).optional(),
  genres: z.array(z.object({ name: z.string() })).optional(),
  storeLink: urlSchema,
  price: z
    .object({ finalMoney: money.optional(), baseMoney: money.optional() })
    .nullish(),
});
function base(
  source: PublicSource,
  id: string,
  title: string,
  observedAt: string,
): SteamGame {
  return {
    id: source + "-" + id,
    slug: source + "-" + id,
    title,
    tagline: "",
    description: "",
    cover: "",
    hero: "",
    genres: [],
    platforms:
      source === "gog" || source === "epic" || source === "xboxpc"
        ? ["PC"]
        : source === "xbox"
          ? ["Xbox"]
          : ["Nintendo"],
    releaseDate: "",
    developer: "Unavailable",
    publisher: "Unavailable",
    score: null,
    reviewCount: "",
    price: null,
    store: {
      gog: "GOG",
      xbox: "Xbox Console",
      xboxpc: "Xbox PC",
      nintendo: "Nintendo",
      epic: "Epic Games Store",
    }[source],
    storeUrl: "",
    featured: false,
    status: "released",
    sourceType: source,
    observedAt,
  };
}
function amount(value: z.infer<typeof money> | undefined) {
  if (
    !value ||
    value.currency !== "ZAR" ||
    !/^\d+(?:\.\d+)?$/.test(value.amount)
  )
    return null;
  const n = Number(value.amount);
  return Number.isFinite(n) ? n : null;
}
function gogGame(g: z.infer<typeof gogEntry>, time: string) {
  const result = base("gog", g.id, g.title, time);
  const price = amount(g.price?.finalMoney);
  const original = amount(g.price?.baseMoney);
  return {
    ...result,
    cover: g.coverVertical ?? g.coverHorizontal ?? "",
    coverFallback: g.coverHorizontal ?? undefined,
    hero: g.galaxyBackgroundImage ?? g.coverHorizontal ?? "",
    genres: g.genres?.map((x) => x.name) ?? [],
    releaseDate: g.releaseDate?.replaceAll(".", "-") ?? "",
    developer: g.developers?.join(", ") || "Unavailable",
    publisher: g.publishers?.join(", ") || "Unavailable",
    price,
    originalPrice:
      price !== null && original !== null && original > price
        ? original
        : undefined,
    storeUrl: g.storeLink,
  };
}
const detailCache = new Map<string, SteamGame>();
function remember(games: SteamGame[]) {
  for (const g of games) {
    if (g.releaseDate && Date.parse(g.releaseDate) > Date.now())
      g.status = "upcoming";
    if (detailCache.size >= 500)
      detailCache.delete(detailCache.keys().next().value!);
    detailCache.set(g.slug, g);
  }
}
function output(
  games: SteamGame[],
  f: StoreFilters,
  total: number,
  hasMore: boolean,
  scope: string,
) {
  const ordered =
    f.sort === "price"
      ? [...games].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
      : games;
  remember(ordered);
  return {
    data: ordered.filter(
      (g) =>
        (!f.genre ||
          g.genres.some((v) => {
            const name = v.toLowerCase();
            const genre = f.genre.toLowerCase();
            return (
              name === genre ||
              (genre === "rpg" && /role.?playing|rpg/.test(name)) ||
              (["action", "adventure"].includes(genre) && name.includes(genre))
            );
          })) &&
        (!f.platform ||
          g.platforms.includes(f.platform) ||
          (f.platform === "Nintendo" && g.sourceType === "nintendo")) &&
        (f.minScore === undefined ||
          (g.score !== null && g.score >= f.minScore)) &&
        (f.maxPrice === undefined ||
          (g.price !== null && g.price <= f.maxPrice)),
    ),
    meta: {
      total,
      page: f.page,
      limit: f.limit,
      pages: Math.ceil(total / f.limit),
      hasMore,
      scope,
    },
  };
}

const msImage = z.object({
  Uri: z.string(),
  ImagePurpose: z.string(),
  Width: z.number().optional(),
  Height: z.number().optional(),
});
const msEntry = z.object({
  DisplaySkuAvailabilities: z.unknown().optional(),
  ProductId: z.string().regex(/^[A-Z0-9]{12}$/),
  LocalizedProperties: z.array(
    z.object({
      ProductTitle: z.string(),
      ProductDescription: z.string().optional(),
      ShortDescription: z.string().optional(),
      DeveloperName: z.string().optional(),
      PublisherName: z.string().optional(),
      Images: z.array(msImage).optional(),
    }),
  ),
  Properties: z
    .object({
      Category: z.string().nullish(),
      XboxConsoleGenCompatible: z.array(z.string()).nullish(),
    })
    .optional(),
});
function secureUrl(url: string | undefined) {
  if (!url) return "";
  const value = url.startsWith("//") ? "https:" + url : url;
  try {
    return new URL(value).protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}
function msGame(
  g: z.infer<typeof msEntry>,
  time: string,
  source: "xbox" | "xboxpc" = "xbox",
) {
  const local = g.LocalizedProperties[0];
  if (!local) throw new Error("Missing Xbox localization");
  const images = local.Images ?? [];
  const cover =
    images.find((x) => x.ImagePurpose === "Poster") ??
    images.find((x) => x.ImagePurpose === "BoxArt") ??
    images.find((x) => x.ImagePurpose === "BrandedKeyArt") ??
    images.find((x) => x.ImagePurpose === "Thumbnail");
  const hero =
    images.find((x) => x.ImagePurpose === "SuperHeroArt") ??
    images.find((x) => x.ImagePurpose === "Screenshot") ??
    cover;
  return {
    ...base(source, g.ProductId, local.ProductTitle, time),
    ...microsoftPrice(
      g.DisplaySkuAvailabilities,
      source === "xboxpc" ? "Windows.Desktop" : "Windows.Xbox",
    ),
    cover: secureUrl(cover?.Uri),
    hero: secureUrl(hero?.Uri),
    description: local.ProductDescription ?? local.ShortDescription ?? "",
    genres: g.Properties?.Category ? [g.Properties.Category] : [],
    developer: local.DeveloperName ?? "Unavailable",
    publisher: local.PublisherName ?? "Unavailable",
    storeUrl: "https://www.xbox.com/en-ZA/games/store/-/" + g.ProductId,
  };
}

const nintendoEntry = z.object({
  nsuid_txt: z.array(z.string().regex(/^\d{14}$/)).optional(),
  fs_id: z.string().regex(/^\d+$/),
  title: z.string(),
  url: z.string().startsWith("/en-gb/"),
  image_url: z.string().optional(),
  image_url_h16x9_s: z.string().optional(),
  image_url_sq_s: z.string().optional(),
  product_catalog_description_s: z.string().optional(),
  excerpt: z.string().optional(),
  date_from: z.string().optional(),
  system_names_txt: z.array(z.string()).optional(),
  pretty_game_categories_txt: z.array(z.string()).optional(),
  developer: z.string().optional(),
  publisher: z.string().optional(),
});
function nintendoGame(g: z.infer<typeof nintendoEntry>, time: string) {
  return {
    ...base("nintendo", g.fs_id, g.title, time),
    cover: secureUrl(g.image_url_sq_s ?? g.image_url),
    hero: secureUrl(g.image_url_h16x9_s ?? g.image_url),
    description: g.product_catalog_description_s ?? g.excerpt ?? "",
    releaseDate: g.date_from ?? "",
    platforms: g.system_names_txt ?? ["Nintendo"],
    genres: g.pretty_game_categories_txt ?? [],
    developer: g.developer ?? "Unavailable",
    publisher: g.publisher ?? "Unavailable",
    storeUrl: "https://www.nintendo.com" + g.url,
  };
}
const epicEntry = z.object({
  namespace: z
    .string()
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string(),
  description: z.string().nullish(),
  offerType: z.string().optional(),
  effectiveDate: z.string().nullish(),
  productSlug: z.string().nullish(),
  urlSlug: z.string().nullish(),
  keyImages: z.array(z.object({ type: z.string(), url: z.string() })),
  catalogNs: z
    .object({
      mappings: z
        .array(z.object({ pageSlug: z.string(), pageType: z.string() }))
        .nullish(),
    })
    .nullish(),
  price: z
    .object({
      totalPrice: z.object({
        discountPrice: z.number(),
        originalPrice: z.number(),
        currencyCode: z.string(),
        currencyInfo: z
          .object({ decimals: z.number().int().min(0).max(4) })
          .optional(),
      }),
    })
    .nullish(),
});
function epicGame(
  g: z.infer<typeof epicEntry>,
  time: string,
  offerScope: "catalogue" | "promotions" = "promotions",
) {
  const cover =
    g.keyImages.find((x) => x.type === "OfferImageTall") ??
    g.keyImages.find((x) => x.type === "Thumbnail");
  const hero = g.keyImages.find((x) => x.type === "OfferImageWide") ?? cover;
  const p = g.price?.totalPrice;
  const price =
    p?.currencyCode === "ZAR" && p.currencyInfo && p.discountPrice >= 0
      ? p.discountPrice / 10 ** p.currencyInfo.decimals
      : null;
  const original =
    p?.currencyCode === "ZAR" && p.currencyInfo
      ? p.originalPrice / 10 ** p.currencyInfo.decimals
      : null;
  const slug =
    g.catalogNs?.mappings?.find((x) => x.pageType === "productHome")
      ?.pageSlug ?? g.productSlug;
  return {
    ...base(
      "epic",
      offerScope === "catalogue" && g.namespace
        ? g.namespace + "--" + g.id
        : g.id,
      g.title,
      time,
    ),
    offerScope,
    cover: secureUrl(cover?.url),
    hero: secureUrl(hero?.url),
    description: g.description ?? "",
    releaseDate: g.effectiveDate ?? "",
    price,
    originalPrice:
      price !== null && original !== null && original > price
        ? original
        : undefined,
    storeUrl:
      slug && /^[a-zA-Z0-9_/-]+$/.test(slug)
        ? "https://store.epicgames.com/en-US/p/" + slug
        : "https://store.epicgames.com/en-US/browse?q=" +
          encodeURIComponent(g.title),
  };
}
async function hydrateNintendo(
  docs: z.infer<typeof nintendoEntry>[],
  time: string,
) {
  const games = docs.map((g) => nintendoGame(g, time));
  const ids = [...new Set(docs.flatMap((g) => g.nsuid_txt?.slice(0, 1) ?? []))];
  if (!ids.length) return games;
  try {
    const response = await request(
      "https://api.ec.nintendo.com/v1/price?" +
        new URLSearchParams({ country: "ZA", lang: "en", ids: ids.join(",") }),
    );
    const prices = nintendoPrices(response.value);
    return games.map((game, index) => ({
      ...game,
      ...(prices.get(docs[index].nsuid_txt?.[0] ?? "") ?? { price: null }),
      observedAt: response.observedAt,
    }));
  } catch {
    return games;
  }
}
async function epicFeed() {
  const result = await request(
    "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=ZA&allowCountries=ZA",
  );
  const parsed = z
    .object({
      data: z.object({
        Catalog: z.object({
          searchStore: z.object({ elements: z.array(epicEntry) }),
        }),
      }),
    })
    .parse(result.value);
  return parsed.data.Catalog.searchStore.elements
    .filter((g) => g.offerType === "BASE_GAME")
    .map((g) => epicGame(g, result.observedAt));
}

const epicFields =
  'id namespace title description offerType effectiveDate productSlug keyImages { type url } catalogNs { mappings { pageSlug pageType } } price(country: "ZA") { totalPrice { discountPrice originalPrice currencyCode currencyInfo { decimals } } }';
const epicCooldown = new Map<string, number>();
function epicQuery(query: string) {
  return request(
    "https://store.epicgames.com/graphql?" + new URLSearchParams({ query }),
  );
}
async function epicCatalogue(f: StoreFilters) {
  const key = f.search + "|" + f.sort;
  if ((epicCooldown.get(key) ?? 0) > Date.now()) return null;
  try {
    const start = (f.page - 1) * f.limit;
    const query =
      '{ Catalog { searchStore(country: "ZA", locale: "en-US", category: "games/edition/base|bundles/games", start: ' +
      start +
      ", count: " +
      f.limit +
      ", keywords: " +
      JSON.stringify(f.search) +
      ", sortBy: " +
      JSON.stringify(f.sort === "price" ? "currentPrice" : "releaseDate") +
      ", sortDir: " +
      JSON.stringify(f.sort === "price" ? "ASC" : "DESC") +
      ") { paging { count total } elements { " +
      epicFields +
      " } } } }";
    const r = await epicQuery(query);
    const data = z
      .object({
        data: z.object({
          Catalog: z.object({
            searchStore: z.object({
              elements: z.array(epicEntry),
              paging: z.object({
                count: z.number().int().nonnegative(),
                total: z.number().int().nonnegative(),
              }),
            }),
          }),
        }),
      })
      .parse(r.value).data.Catalog.searchStore;
    const games = [
      ...new Map(
        data.elements
          .filter((g) => ["BASE_GAME", "BUNDLE"].includes(g.offerType ?? ""))
          .map((g) => [g.id, epicGame(g, r.observedAt, "catalogue")]),
      ).values(),
    ];
    return output(
      games,
      f,
      data.paging.total,
      data.paging.count > 0 && start + data.paging.count < data.paging.total,
      "Epic paginated game catalogue and game bundles for ZA; regional prices where supplied.",
    );
  } catch {
    if (epicCooldown.size >= 150)
      epicCooldown.delete(epicCooldown.keys().next().value!);
    epicCooldown.set(key, Date.now() + 300000);
    return null;
  }
}
export async function publicCatalogue(source: PublicSource, f: StoreFilters) {
  if (source === "gog") {
    const q = new URLSearchParams({
      limit: String(f.limit),
      page: String(f.page),
      locale: "en-US",
      countryCode: "ZA",
      currencyCode: "ZAR",
      productType: "in:game",
      order:
        f.sort === "price"
          ? "asc:price"
          : f.sort === "newest"
            ? "desc:releaseDate"
            : "desc:trending",
    });
    if (f.dealsOnly) q.set("discounted", "eq:true");
    if (f.search) q.set("query", "like:" + f.search);
    const result = await request("https://catalog.gog.com/v1/catalog?" + q);
    const data = z
      .object({
        products: z.array(gogEntry),
        productCount: z.number().int().nonnegative(),
        pages: z.number().int().nonnegative(),
      })
      .parse(result.value);
    return output(
      data.products
        .filter((g) => g.productType === "game")
        .map((g) => gogGame(g, result.observedAt)),
      f,
      data.productCount,
      f.page < data.pages,
      "GOG catalogue; ZAR prices; filters apply to each loaded page. Metacritic scores unavailable.",
    );
  }
  if (source === "xbox" || source === "xboxpc") {
    const q = new URLSearchParams({
      market: "ZA",
      languages: "en-za",
      query: f.search,
      platformDependencyName:
        source === "xboxpc" ? "Windows.Desktop" : "Windows.Xbox",
      $skip: String((f.page - 1) * f.limit),
      $top: String(f.limit),
    });
    const result = await request(
      "https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/games/products?" +
        q,
    );
    const data = z
      .object({
        Products: z.array(msEntry),
        TotalResultCount: z.number().int().nonnegative(),
        HasMorePages: z.boolean(),
      })
      .parse(result.value);
    let products = data.Products;
    if (products.length) {
      try {
        const details = await request(
          "https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=" +
            products.map((g) => g.ProductId).join(",") +
            "&market=ZA&languages=en-za",
        );
        const detailed = z
          .object({ Products: z.array(msEntry) })
          .parse(details.value).Products;
        const byId = new Map(detailed.map((g) => [g.ProductId, g]));
        products = products.map((g) => byId.get(g.ProductId) ?? g);
      } catch {
        /* Metadata remains usable if optional pricing details fail. */
      }
    }
    return output(
      products.map((g) => msGame(g, result.observedAt, source)),
      f,
      data.TotalResultCount,
      data.HasMorePages,
      (source === "xboxpc"
        ? "Xbox PC ZA catalogue (Windows)."
        : "Xbox Console ZA catalogue.") +
        " Public ZA purchase prices where offered; excludes trials and subscription-only offers. Metacritic scores unavailable. Filters apply to loaded pages.",
    );
  }
  if (source === "nintendo") {
    const query = f.search
      ? f.search.replace(/[+!(){}\[\]^"~*?:\\/|&-]/g, " ").trim()
      : "*:*";
    const q = new URLSearchParams({
      fq: f.dealsOnly
        ? "type:GAME AND nsuid_txt:[* TO *] AND price_has_discount_b:true"
        : "type:GAME",
      q: query || "*:*",
      start: String((f.page - 1) * f.limit),
      rows: String(f.limit),
      wt: "json",
      sort: f.sort === "newest" ? "date_from desc" : "score desc",
    });
    const result = await request(
      "https://search.nintendo-europe.com/en/select?" + q,
    );
    const data = z
      .object({
        response: z.object({
          numFound: z.number().int().nonnegative(),
          start: z.number(),
          docs: z.array(nintendoEntry),
        }),
      })
      .parse(result.value).response;
    if (data.start !== (f.page - 1) * f.limit)
      throw new Error("Nintendo returned an unexpected page");
    return output(
      await hydrateNintendo(data.docs, result.observedAt),
      f,
      data.numFound,
      f.page * f.limit < data.numFound,
      f.dealsOnly
        ? "UK sale candidates checked against ZA eShop prices; only confirmed ZA discounts are shown. Not an exhaustive ZA sale list."
        : "Nintendo UK metadata, including legacy systems, with verified ZA eShop prices where a digital product is on sale. No foreign prices or Metacritic scores. Filters apply to loaded pages.",
    );
  }
  const catalogue = await epicCatalogue(f);
  if (catalogue) return catalogue;
  const all = (await epicFeed()).filter(
    (g) => !f.search || g.title.toLowerCase().includes(f.search.toLowerCase()),
  );
  if (f.sort === "price")
    all.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  if (f.sort === "newest")
    all.sort(
      (a, b) =>
        (Date.parse(b.releaseDate) || 0) - (Date.parse(a.releaseDate) || 0),
    );
  return output(
    all.slice((f.page - 1) * f.limit, f.page * f.limit),
    f,
    all.length,
    f.page * f.limit < all.length,
    "Epic full catalogue is unavailable from this server. Showing the promotions feed only, including upcoming offers; this is not the full list. Open Epic to browse all games.",
  );
}
async function optionalRequirements(
  url: string,
  parse: (data: unknown) => SystemRequirements[],
) {
  try {
    return parse((await request(url)).value);
  } catch {
    return [];
  }
}
async function loadPublicGame(slug: string): Promise<SteamGame | null> {
  const entry = detailCache.get(slug);
  const cached =
    entry && Date.now() - Date.parse(entry.observedAt) < 300000
      ? entry
      : undefined;
  const needsRequirements =
    /^(gog|xboxpc)-/.test(slug) && cached?.systemRequirements === undefined;
  if (cached?.description && !needsRequirements) return cached;
  const m = /^(gog|xboxpc|xbox|nintendo|epic)-([a-zA-Z0-9_-]+)$/.exec(slug);
  if (!m) return null;
  const [, source, id] = m;
  if (source === "epic") {
    if (cached) return cached;
    const parts = /^([a-zA-Z0-9_]+)--([a-zA-Z0-9_-]+)$/.exec(id);
    if (parts) {
      const r = await epicQuery(
        "{ Catalog { catalogOffer(namespace: " +
          JSON.stringify(parts[1]) +
          ", id: " +
          JSON.stringify(parts[2]) +
          ', locale: "en-US", country: "ZA") { ' +
          epicFields +
          " } } }",
      );
      const data = z
        .object({
          data: z.object({
            Catalog: z.object({ catalogOffer: epicEntry.nullable() }),
          }),
        })
        .parse(r.value).data.Catalog.catalogOffer;
      return data ? epicGame(data, r.observedAt, "catalogue") : null;
    }
    return (await epicFeed()).find((g) => g.slug === slug) ?? null;
  }
  if (source === "xbox" || source === "xboxpc") {
    if (!/^[A-Z0-9]{12}$/.test(id)) return null;
    const r = await request(
      "https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=" +
        id +
        "&market=ZA&languages=en-za",
    );
    const data = z.object({ Products: z.array(msEntry) }).parse(r.value);
    if (!data.Products[0]) return null;
    const game = msGame(data.Products[0], r.observedAt, source);
    if (source === "xboxpc") {
      game.systemRequirements = await optionalRequirements(
        "https://storeedgefd.dsx.mp.microsoft.com/v9.0/products/" +
          id +
          "?market=ZA&locale=en-za&deviceFamily=Windows.Desktop",
        microsoftRequirements,
      );
    }
    return game;
  }
  if (!/^\d+$/.test(id)) return null;
  if (source === "nintendo") {
    const q = new URLSearchParams({
      fq: "type:GAME",
      q: "fs_id:" + id,
      rows: "1",
      wt: "json",
    });
    const r = await request(
      "https://search.nintendo-europe.com/en/select?" + q,
    );
    const data = z
      .object({ response: z.object({ docs: z.array(nintendoEntry) }) })
      .parse(r.value);
    return data.response.docs[0]
      ? (await hydrateNintendo(data.response.docs, r.observedAt))[0]
      : null;
  }
  const r = await request(
    "https://api.gog.com/products/" + id + "?expand=description",
  );
  const data = z
    .object({
      id: z.number(),
      title: z.string(),
      slug: z.string(),
      links: z.object({ product_card: z.string() }),
      images: z.object({ background: z.string().optional() }).optional(),
      description: z
        .object({ lead: z.string().optional(), full: z.string().optional() })
        .optional(),
    })
    .parse(r.value);
  let price = cached?.price ?? null;
  let originalPrice = cached?.originalPrice;
  try {
    const pricing = await request(
      "https://api.gog.com/products/" + id + "/prices?countryCode=ZA",
    );
    const data = z
      .object({
        _embedded: z.object({
          prices: z.array(
            z.object({
              currency: z.object({ code: z.string() }),
              basePrice: z.string(),
              finalPrice: z.string(),
            }),
          ),
        }),
      })
      .parse(pricing.value);
    const zar = data._embedded.prices.find((p) => p.currency.code === "ZAR");
    const parse = (v: string | undefined) =>
      v && /^\d+ ZAR$/.test(v) ? Number(v.split(" ")[0]) / 100 : null;
    const current = parse(zar?.finalPrice);
    const original = parse(zar?.basePrice);
    price = current;
    originalPrice =
      current !== null && original !== null && original > current
        ? original
        : undefined;
  } catch {
    /* Retain a fresh catalogue price if the optional price endpoint is unavailable. */
  }
  return {
    ...base("gog", String(data.id), data.title, r.observedAt),
    ...cached,
    description: stripMarkup(
      data.description?.lead ?? data.description?.full ?? "",
    ),
    systemRequirements: await optionalRequirements(
      "https://api.gog.com/v2/games/" + id,
      gogRequirements,
    ),
    cover: cached?.cover ?? secureUrl(data.images?.background),
    hero: cached?.hero ?? secureUrl(data.images?.background),
    storeUrl: secureUrl(data.links.product_card),
    price,
    originalPrice,
  };
}
export async function publicGame(slug: string): Promise<SteamGame | null> {
  try {
    const game = await loadPublicGame(slug);
    if (game) remember([game]);
    return game;
  } catch (error) {
    if (error instanceof StoreHttpError && error.status === 404) return null;
    throw error;
  }
}

function stripMarkup(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export { request as publicStoreRequest };
