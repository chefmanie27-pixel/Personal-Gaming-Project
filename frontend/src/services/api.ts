import axios from "axios";
import type { Game, GamesResponse } from "../types";

const client = axios.create({
  timeout: 30000,
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000/api",
});

export async function fetchGames(
  params: Record<string, string | number | undefined> = {},
): Promise<GamesResponse> {
  const { data } = await client.get<GamesResponse>("/games", { params });
  return data;
}

export async function fetchGame(slug: string): Promise<Game> {
  const { data } = await client.get<{ data: Game }>(`/games/${slug}`);
  return data.data;
}

export async function fetchDeals(
  budget?: number,
  source = "all",
  cursor?: Partial<Record<import("../types").DealSource, number>>,
): Promise<import("../types").DealsResponse> {
  const { data } = await client.get("/deals", {
    params: {
      budget,
      source,
      cursor: cursor ? JSON.stringify(cursor) : undefined,
      limit: 24,
    },
  });
  return data;
}

export async function fetchPriceHistory(slug: string): Promise<{
  data: Array<{ amount: number; observedAt: string; sourceType: string }>;
  meta: {
    currency: string;
    sourceType: string;
    coverage?: string;
    region?: string;
    store?: string;
  };
}> {
  const { data } = await client.get(`/games/${slug}/price-history`);
  return data;
}

let sourcesPending: Promise<import("../types").CatalogueSource[]> | undefined;
export async function fetchSources(): Promise<
  import("../types").CatalogueSource[]
> {
  if (!sourcesPending)
    sourcesPending = client
      .get("/sources")
      .then((r) => r.data.data)
      .catch((error) => {
        sourcesPending = undefined;
        throw error;
      });
  return sourcesPending;
}

export async function fetchSubscriptions(): Promise<{
  data: import("../types").SubscriptionPlan[];
}> {
  return (await client.get("/subscriptions")).data;
}

export async function fetchRelated(
  slug: string,
  kind: "editions" | "dlc",
  page = 1,
): Promise<import("../types").RelatedResponse> {
  return (
    await client.get("/games/" + encodeURIComponent(slug) + "/related", {
      params: { kind, page, limit: 8 },
    })
  ).data;
}
