import { rawgRequirements } from "./requirements.js";
import { config } from "../config.js";
import type { SteamGame } from "./steam.js";
interface Entry {
  id: number;
  name: string;
  background_image?: string;
  description_raw?: string;
  released?: string;
  metacritic: number | null;
  genres?: { name: string }[];
  platforms?: {
    platform: { name: string };
    requirements_en?: { minimum?: string; recommended?: string };
  }[];
}
async function request<T>(path: string): Promise<T> {
  if (!config.RAWG_API_KEY) throw new Error("RAWG is not configured");
  const url = new URL("https://api.rawg.io/api" + path);
  url.searchParams.set("key", config.RAWG_API_KEY);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("RAWG unavailable");
  return response.json() as Promise<T>;
}
function map(g: Entry): SteamGame {
  return {
    id: "rawg-" + g.id,
    slug: "rawg-" + g.id,
    title: g.name,
    tagline: "",
    description: g.description_raw ?? "",
    systemRequirements: rawgRequirements(g),
    cover: g.background_image ?? "",
    hero: g.background_image ?? "",
    genres: g.genres?.map((x) => x.name) ?? [],
    platforms: g.platforms?.map((x) => x.platform.name) ?? [],
    releaseDate: g.released ?? "",
    developer: "Unavailable",
    publisher: "Unavailable",
    score: g.metacritic ?? null,
    reviewCount: "",
    price: null,
    store: "Storefronts",
    storeUrl: "https://rawg.io/games/" + g.id,
    featured: false,
    status:
      g.released && g.released <= new Date().toISOString().slice(0, 10)
        ? "released"
        : "upcoming",
    sourceType: "rawg",
    observedAt: new Date().toISOString(),
  };
}
export async function rawgCatalogue(f: {
  search: string;
  page: number;
  limit: number;
  sort: string;
  platform: string;
  genre: string;
  minScore?: number;
  maxPrice?: number;
}) {
  if (f.maxPrice !== undefined)
    return {
      data: [],
      meta: {
        total: 0,
        page: f.page,
        limit: f.limit,
        pages: 0,
        hasMore: false,
        scope: "RAWG does not supply regional prices; clear the price filter.",
      },
    };
  const q = new URLSearchParams({
    page: String(f.page),
    page_size: String(f.limit),
    search: f.search,
    ordering:
      ({ score: "-metacritic", newest: "-released" } as Record<string, string>)[
        f.sort
      ] ?? "-added",
  });
  if (f.minScore !== undefined) q.set("metacritic", f.minScore + ",100");
  const platform = (
    { PC: "1", PlayStation: "2", Xbox: "3", Nintendo: "7" } as Record<
      string,
      string
    >
  )[f.platform];
  if (platform) q.set("parent_platforms", platform);
  if (f.genre)
    q.set(
      "genres",
      ({ RPG: "role-playing-games-rpg" } as Record<string, string>)[f.genre] ??
        f.genre.toLowerCase().replaceAll(" ", "-"),
    );
  const result = await request<{
    results: Entry[];
    count: number;
    next: string | null;
  }>("/games?" + q);
  return {
    data: result.results.map(map),
    meta: {
      total: result.count,
      page: f.page,
      limit: f.limit,
      pages: Math.ceil(result.count / f.limit),
      hasMore: !!result.next,
      scope: "Metadata and store links from RAWG; regional prices unavailable",
    },
  };
}
export async function rawgDetail(slug: string) {
  if (!/^rawg-[1-9][0-9]*$/.test(slug)) return null;
  const id = slug.slice(5);
  const [g, stores] = await Promise.all([
    request<Entry>("/games/" + id),
    request<{ results: { url: string }[] }>("/games/" + id + "/stores"),
  ]);
  return {
    ...map(g),
    storeLinks: stores.results
      .map((x) => x.url)
      .filter((url) => {
        try {
          return new URL(url).protocol === "https:";
        } catch {
          return false;
        }
      }),
  };
}
