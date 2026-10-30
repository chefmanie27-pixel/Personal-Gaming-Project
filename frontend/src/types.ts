export interface SystemRequirements {
  platform: string;
  minimum: string | null;
  recommended: string | null;
}
export interface Game {
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
  storeLinks?: string[];
  storeUrl?: string;
  observedAt?: string;
  featured?: boolean;
  status: "released" | "upcoming";
}

export interface GamesResponse {
  data: Game[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
    hasMore: boolean;
    scope?: string;
  };
}

export interface CatalogueSource {
  id: string;
  name: string;
  available: boolean;
  coverage: string;
  url: string;
  platforms: string[];
  prices: boolean;
  genres?: boolean;
  scores: boolean;
  note: string;
}

export interface SubscriptionPrice {
  months: number;
  amount: number | null;
  currency: "ZAR";
  status: "live" | "reference" | "unavailable";
  checkedAt: string | null;
  sourceUrl: string;
}
export interface SubscriptionPlan {
  id: string;
  name: string;
  provider: string;
  platforms: string[];
  note: string;
  prices: SubscriptionPrice[];
}
