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
  screenshots?: string[];
  trailers?: { name: string; url: string; poster?: string }[];
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
  offerScope?: "catalogue" | "promotions";
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

export interface RelatedProduct {
  id: string;
  title: string;
  kind: "edition" | "bundle" | "package" | "dlc" | "soundtrack";
  url: string;
}
export interface RelatedResponse {
  data: RelatedProduct[];
  meta: {
    page: number;
    total: number | null;
    hasMore: boolean;
    supported: boolean;
    partial: boolean;
    storeUrl: string | null;
  };
}

export type DealSource =
  "steam" | "gog" | "xbox" | "xboxpc" | "nintendo" | "epic";
export interface DealsResponse {
  data: Array<Game & { discount: number }>;
  meta: {
    currency: string;
    sourceType: string;
    hasMore: boolean;
    nextCursor: Partial<Record<DealSource, number>>;
    partial: boolean;
    sources: Array<{
      id: DealSource;
      name: string;
      page: number;
      hasMore: boolean;
      scope: string;
      error: string | null;
    }>;
    updatedAt: string | null;
    scope: string;
  };
}
