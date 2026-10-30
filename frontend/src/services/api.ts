import axios from "axios";
import type { Game, GamesResponse } from "../types";

const client = axios.create({
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

export async function fetchDeals(budget?: number): Promise<{
  data: Array<Game & { discount: number; sourceType: string }>;
  meta: { currency: string; sourceType: string; updatedAt: string };
}> {
  const { data } = await client.get("/deals", { params: { budget } });
  return data;
}

export async function fetchPriceHistory(slug: string): Promise<{
  data: Array<{ amount: number; observedAt: string; sourceType: string }>;
  meta: { currency: string; sourceType: string };
}> {
  const { data } = await client.get(`/games/${slug}/price-history`);
  return data;
}

export async function fetchSources(): Promise<
  import("../types").CatalogueSource[]
> {
  return (await client.get("/sources")).data.data;
}

export async function fetchSubscriptions(): Promise<{
  data: import("../types").SubscriptionPlan[];
}> {
  return (await client.get("/subscriptions")).data;
}
