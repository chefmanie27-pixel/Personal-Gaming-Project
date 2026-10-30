import { steamRequirements, type SystemRequirements } from "./requirements.js";
export interface SteamGame {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  cover: string;
  coverFallback?: string;
  hero: string;
  systemRequirements?: SystemRequirements[];
  genres: string[];
  platforms: string[];
  releaseDate: string;
  developer: string;
  publisher: string;
  score: number | null;
  reviewCount: string;
  price: number | null;
  originalPrice?: number;
  store: string;
  storefronts?: string[];
  storeUrl: string;
  featured: boolean;
  status: "released" | "upcoming";
  sourceType: string;
  observedAt: string;
}
interface Item {
  id: number;
  name: string;
  header_image?: string;
  tiny_image?: string;
  final_price?: number;
  original_price?: number;
  currency?: string;
  price?: { final: number; initial: number; currency: string };
}
interface Detail {
  pc_requirements?: unknown;
  mac_requirements?: unknown;
  linux_requirements?: unknown;
  type: string;
  name: string;
  short_description?: string;
  header_image: string;
  background?: string;
  genres?: { description: string }[];
  release_date?: { date: string; coming_soon: boolean };
  developers?: string[];
  publishers?: string[];
  metacritic?: { score: number };
  recommendations?: { total: number };
  is_free: boolean;
  price_overview?: { currency: string; final: number; initial: number };
}
const cache = new Map<string, { expires: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
async function request<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const active = pending.get(path);
  if (active) return active as Promise<T>;
  const work = (async () => {
    const response = await fetch(
      path.startsWith("https://api.steampowered.com/")
        ? path
        : "https://store.steampowered.com" + path,
      {
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!response.ok) throw new Error("Steam returned " + response.status);
    const value: unknown = await response.json();
    if (cache.size >= 250) cache.delete(cache.keys().next().value!);
    cache.set(path, { expires: Date.now() + 600000, value });
    return value;
  })();
  pending.set(path, work);
  try {
    return (await work) as T;
  } finally {
    pending.delete(path);
  }
}
function summary(item: Item, observedAt = new Date().toISOString()): SteamGame {
  const p =
    item.price ??
    (item.currency
      ? {
          final: item.final_price!,
          initial: item.original_price!,
          currency: item.currency,
        }
      : undefined);
  const amount =
    p?.currency === "ZAR" && Number.isFinite(p.final) ? p.final / 100 : null;
  return {
    id: "steam-" + item.id,
    slug: "steam-" + item.id,
    title: item.name,
    tagline: "",
    description: "",
    cover: item.header_image ?? item.tiny_image ?? "",
    coverFallback: item.header_image ?? "",
    hero:
      item.header_image ??
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`,
    genres: [],
    platforms: ["PC"],
    releaseDate: "",
    developer: "Unavailable",
    publisher: "Unavailable",
    score: null,
    reviewCount: "",
    price: amount,
    originalPrice:
      amount !== null && p && p.initial > p.final ? p.initial / 100 : undefined,
    store: "Steam",
    storeUrl: "https://store.steampowered.com/app/" + item.id + "/",
    featured: true,
    status: "released",
    sourceType: "steam",
    observedAt,
  };
}
export async function steamCatalogue(search?: string): Promise<SteamGame[]> {
  if (search) {
    const result = await request<{ items: Item[] }>(
      "/api/storesearch/?term=" +
        encodeURIComponent(search) +
        "&cc=za&l=english",
    );
    return result.items.map((item) =>
      summary(
        item,
        new Date(
          cache.get(
            "/api/storesearch/?term=" +
              encodeURIComponent(search) +
              "&cc=za&l=english",
          )!.expires - 600000,
        ).toISOString(),
      ),
    );
  }
  const result = await request<Record<string, { items?: Item[] }>>(
    "/api/featuredcategories/?cc=za&l=english",
  );
  const unique = new Map<number, Item>();
  for (const category of [
    "specials",
    "top_sellers",
    "new_releases",
    "coming_soon",
  ])
    for (const item of result[category]?.items ?? []) unique.set(item.id, item);
  if (!unique.size) throw new Error("Steam returned no games");
  const art = await steamArtwork([...unique.keys()]);
  return [...unique.values()].map((item) =>
    Object.assign(
      summary(
        item,
        new Date(
          cache.get("/api/featuredcategories/?cc=za&l=english")!.expires -
            600000,
        ).toISOString(),
      ),
      art.get(item.id) ?? {},
    ),
  );
}
export async function steamGame(
  slug: string,
  withArtwork = true,
): Promise<SteamGame | null> {
  const match = /^steam-([1-9][0-9]{0,9})$/.exec(slug);
  if (!match) return null;
  const id = match[1];
  const result = await request<
    Record<string, { success: boolean; data?: Detail }>
  >("/api/appdetails?appids=" + id + "&cc=za&l=english");
  const item = result[id];
  if (!item?.success || !item.data || item.data.type !== "game") return null;
  const d = item.data;
  const game = summary(
    {
      id: Number(id),
      name: d.name,
      header_image: d.header_image,
      price: d.price_overview,
    },
    new Date(
      cache.get("/api/appdetails?appids=" + id + "&cc=za&l=english")!.expires -
        600000,
    ).toISOString(),
  );
  game.description = (d.short_description ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  game.tagline = game.description;
  game.systemRequirements = steamRequirements(d);
  game.hero = d.background || d.header_image;
  game.cover = d.header_image;
  game.genres = d.genres?.map((g) => g.description) ?? [];
  game.developer = d.developers?.join(", ") || "Unavailable";
  game.publisher = d.publishers?.join(", ") || "Unavailable";
  game.score = d.metacritic?.score ?? null;
  game.reviewCount = String(d.recommendations?.total ?? "");
  game.releaseDate = d.release_date?.date ?? "";
  game.status = d.release_date?.coming_soon ? "upcoming" : "released";
  if (d.is_free) game.price = 0;
  if (withArtwork) {
    const art = await steamArtwork([Number(id)]);
    Object.assign(game, art.get(Number(id)) ?? { cover: d.header_image });
  }
  return game;
}

interface Assets {
  asset_url_format?: string;
  library_capsule_2x?: string;
  library_capsule?: string;
  header_2x?: string;
  header?: string;
  library_hero_2x?: string;
  library_hero?: string;
}
async function steamArtwork(ids: number[]) {
  const mapped = new Map<number, { cover: string; hero?: string }>();
  if (!ids.length) return mapped;
  try {
    const input = {
      ids: ids.map((appid) => ({ appid })),
      context: { language: "english", country_code: "ZA" },
      data_request: { include_assets: true },
    };
    const result = await request<{
      response: { store_items?: { id: number; assets?: Assets }[] };
    }>(
      "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=" +
        encodeURIComponent(JSON.stringify(input)),
    );
    for (const item of result.response.store_items ?? []) {
      const a = item.assets;
      if (!a?.asset_url_format) continue;
      const cover =
        a.library_capsule_2x ?? a.library_capsule ?? a.header_2x ?? a.header;
      const hero =
        a.library_hero_2x ?? a.library_hero ?? a.header_2x ?? a.header;
      const url = (file: string) =>
        "https://shared.fastly.steamstatic.com/store_item_assets/" +
        a.asset_url_format!.replace("$" + "{FILENAME}", () => file);
      if (cover)
        mapped.set(item.id, {
          cover: url(cover),
          ...(hero ? { hero: url(hero) } : {}),
        });
    }
  } catch {
    /* Use the genuine detail header if artwork metadata is unavailable. */
  }
  return mapped;
}
export async function steamPage(
  search: string,
  page: number,
  limit: number,
  sort: string,
) {
  // Steam supports 50-item windows. Translate client pages to aligned provider windows.
  const offset = (page - 1) * limit;
  const first = Math.floor(offset / 50) * 50;
  const last = Math.floor((offset + limit - 1) / 50) * 50;
  const all: string[] = [];
  let total = 0;
  for (let start = first; start <= last; start += 50) {
    const query = new URLSearchParams({
      term: search,
      start: String(start),
      count: "50",
      infinite: "1",
      category1: "998",
      cc: "za",
      l: "english",
      sort_by:
        (
          {
            price: "Price_ASC",
            newest: "Released_DESC",
            score: "Metascore_DESC",
          } as Record<string, string>
        )[sort] ?? "_ASC",
    });
    const result = await request<{
      results_html: string;
      total_count: number;
      start: number;
    }>("/search/results/?" + query);
    if (
      typeof result.results_html !== "string" ||
      !Number.isFinite(Number(result.total_count)) ||
      Number(result.start) !== start
    )
      throw new Error("Invalid Steam search page");
    total = Number(result.total_count);
    all.push(
      ...[...result.results_html.matchAll(/data-ds-appid="(\d+)"/g)].map(
        (m) => m[1],
      ),
    );
  }
  const unique = [
    ...new Set(all.slice(offset - first, offset - first + limit)),
  ];
  const art = await steamArtwork(unique.map(Number));
  const games: SteamGame[] = [];
  for (let i = 0; i < unique.length; i += 4) {
    const batch = await Promise.all(
      unique.slice(i, i + 4).map((id) => steamGame("steam-" + id, false)),
    );
    for (const game of batch)
      if (game) {
        Object.assign(game, art.get(Number(game.id.slice(6))) ?? {});
        games.push(game);
      }
  }
  return { data: games, total, hasMore: offset + limit < total };
}

export { request as steamRequest };
