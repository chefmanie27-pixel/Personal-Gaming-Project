import { test } from "node:test";
import assert from "node:assert/strict";
import { dealsQuerySchema, getDeals, type DealLoader } from "../src/deals.js";
import { steamPage, type SteamGame } from "../src/integrations/steam.js";
import { publicCatalogue } from "../src/integrations/publicStores.js";
const game = (slug: string, price: number | null, originalPrice?: number) =>
  ({
    slug,
    id: slug,
    title: slug,
    price,
    originalPrice,
    status: "released",
    releaseDate: "2020-01-01",
    observedAt: new Date().toISOString(),
  }) as SteamGame;
test("deal filters validate budgets, source names and bounded independent source cursors", () => {
  assert.equal(dealsQuerySchema.parse({}).source, "all");
  assert.equal(
    dealsQuerySchema.parse({ budget: "123.45", source: "gog" }).budget,
    123.45,
  );
  for (const bad of [
    { budget: 0 },
    { budget: -1 },
    { source: "fake" },
    { limit: 51 },
    { page: 0 },
    { cursor: "invalid" },
    { cursor: '{"gog":-1}' },
    { cursor: '{"fake":1}' },
  ])
    assert.equal(dealsQuerySchema.safeParse(bad).success, false);
});
test("multi-store deals retain only real discounts, deduplicate listings and isolate provider failures", async () => {
  const loader: DealLoader = async (source) => {
    if (source === "steam") throw new Error("Offline");
    return {
      data:
        source === "gog"
          ? [
              game("gog-1", 50, 100),
              game("gog-1", 50, 100),
              game("gog-2", 100, 100),
              game("gog-3", null, 100),
            ]
          : source === "nintendo"
            ? [
                game("nintendo-1", 0, 100),
                { ...game("nintendo-2", 5, 100), status: "upcoming" },
                game("nintendo-3", -1, 100),
              ]
            : [],
      meta: { hasMore: false, scope: source },
    };
  };
  const result = await getDeals(dealsQuerySchema.parse({}), loader);
  assert.equal(result.data.length, 2);
  assert.equal(result.data[0].slug, "nintendo-1");
  assert.equal(result.data[0].discount, 100);
  assert.equal(result.meta.partial, true);
  assert.equal(result.meta.nextCursor.steam, 1);
  assert.equal(result.meta.nextCursor.gog, 0);
  const budget = await getDeals(dealsQuerySchema.parse({ budget: 30 }), loader);
  assert.deepEqual(
    budget.data.map((g) => g.slug),
    ["nintendo-1"],
  );
});
test("pagination advances successful providers, retries failed pages, and skips exhausted providers", async () => {
  const calls: string[] = [];
  const loader: DealLoader = async (source, page) => {
    calls.push(source + ":" + page);
    return {
      data: [game(source + "-" + page, 10, 20)],
      meta: { hasMore: source === "gog", scope: source },
    };
  };
  const result = await getDeals(
    dealsQuerySchema.parse({
      cursor: JSON.stringify({
        steam: 0,
        gog: 3,
        xbox: 0,
        xboxpc: 0,
        nintendo: 0,
        epic: 0,
      }),
    }),
    loader,
  );
  assert.deepEqual(calls, ["gog:3"]);
  assert.equal(result.meta.nextCursor.gog, 4);
  assert.equal(result.meta.hasMore, true);
  const failure = await getDeals(
    dealsQuerySchema.parse({ source: "xbox", page: 4 }),
    async () => {
      throw new Error("Failed");
    },
  );
  assert.equal(failure.meta.nextCursor.xbox, 4);
  assert.equal(failure.data.length, 0);
  assert.equal(failure.meta.partial, true);
});
test("Steam deals use the paginated specials search rather than the featured feed", async () => {
  const original = globalThis.fetch;
  let sales = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/search/results")) {
      assert.equal(url.searchParams.get("specials"), "1");
      sales = true;
      return new Response(
        JSON.stringify({
          results_html: '<a data-ds-appid="778899"></a>',
          total_count: 123,
          start: 0,
        }),
      );
    }
    if (url.hostname === "api.steampowered.com")
      return new Response(JSON.stringify({ response: { store_items: [] } }));
    return new Response(
      JSON.stringify({
        "778899": {
          success: true,
          data: {
            type: "game",
            name: "Steam sale fixture",
            header_image: "https://example.com/art.jpg",
            is_free: false,
            price_overview: { currency: "ZAR", initial: 20000, final: 10000 },
          },
        },
      }),
    );
  };
  try {
    const result = await steamPage("", 1, 2, "featured", true);
    assert.equal(sales, true);
    assert.equal(result.hasMore, true);
    assert.equal(result.data[0].price, 100);
  } finally {
    globalThis.fetch = original;
  }
});
test("GOG deal discovery requests the provider discounted filter", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("discounted"), "eq:true");
    return new Response(
      JSON.stringify({ products: [], productCount: 0, pages: 0 }),
    );
  };
  try {
    await publicCatalogue("gog", {
      search: "sale-filter-fixture",
      page: 1,
      limit: 24,
      sort: "featured",
      genre: "",
      platform: "",
      dealsOnly: true,
    });
  } finally {
    globalThis.fetch = original;
  }
});
