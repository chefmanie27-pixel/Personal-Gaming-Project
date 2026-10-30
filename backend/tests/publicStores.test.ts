import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicCatalogue,
  publicGame,
} from "../src/integrations/publicStores.js";
import { catalogueSources } from "../src/integrations/sources.js";
const filters = {
  search: "fixture",
  page: 1,
  limit: 2,
  sort: "featured",
  genre: "",
  platform: "",
};

test("GOG paginates with ZAR prices and hydrates details without losing the cover", async () => {
  const original = globalThis.fetch;
  let catalogueCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "catalog.gog.com") {
      catalogueCalls++;
      assert.equal(url.searchParams.get("countryCode"), "ZA");
      const page = Number(url.searchParams.get("page"));
      return new Response(
        JSON.stringify({
          pages: 2,
          productCount: 3,
          products: [
            {
              id: String(800 + page),
              slug: "fixture-" + page,
              title: "Fixture " + page,
              productType: "game",
              coverVertical: "https://images.gog-statics.com/large.jpg",
              storeLink: "https://www.gog.com/en/game/fixture",
              price: {
                finalMoney: { amount: "45.50", currency: "ZAR" },
                baseMoney: { amount: "60", currency: "ZAR" },
              },
            },
          ],
        }),
      );
    }
    if (url.pathname.endsWith("/prices"))
      return new Response(
        JSON.stringify({
          _embedded: {
            prices: [
              {
                currency: { code: "ZAR" },
                basePrice: "6000 ZAR",
                finalPrice: "4550 ZAR",
              },
            ],
          },
        }),
      );
    return new Response(
      JSON.stringify({
        id: 801,
        title: "Fixture 1",
        slug: "fixture",
        links: { product_card: "https://www.gog.com/game/fixture" },
        description: { lead: "<p>Real description &amp; details</p>" },
        images: { background: "//images.gog-statics.com/background.jpg" },
      }),
    );
  };
  try {
    const first = await publicCatalogue("gog", filters);
    assert.equal(first.data[0].price, 45.5);
    assert.equal(first.data[0].score, null);
    assert.equal(first.meta.hasMore, true);
    const second = await publicCatalogue("gog", { ...filters, page: 2 });
    assert.notEqual(first.data[0].id, second.data[0].id);
    assert.equal(second.meta.hasMore, false);
    const detail = await publicGame(first.data[0].slug);
    assert.equal(detail?.description, "Real description & details");
    assert.equal(detail?.price, 45.5);
    assert.equal(detail?.cover, first.data[0].cover);
    await publicCatalogue("gog", filters);
    assert.equal(catalogueCalls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("GOG does not reinterpret other currencies or missing amounts as ZAR", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        pages: 1,
        productCount: 1,
        products: [
          {
            id: "899",
            slug: "currency-fixture",
            title: "Currency fixture",
            productType: "game",
            storeLink: "https://www.gog.com/en/game/fixture",
            price: { finalMoney: { amount: "9.99", currency: "USD" } },
          },
        ],
      }),
    );
  try {
    const result = await publicCatalogue("gog", {
      ...filters,
      search: "currency-fixture",
    });
    assert.equal(result.data[0].price, null);
    const filtered = await publicCatalogue("gog", {
      ...filters,
      search: "currency-fixture",
      maxPrice: 100,
    });
    assert.equal(filtered.data.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("Xbox uses OData pagination, Xbox platform restriction, and keeps subscription prices unknown", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(
      url.searchParams.get("platformDependencyName"),
      "Windows.Xbox",
    );
    assert.equal(url.searchParams.get("$skip"), "2");
    assert.equal(url.searchParams.get("$top"), "2");
    return new Response(
      JSON.stringify({
        Products: [
          {
            ProductId: "9NP1P1WFS0LB",
            LocalizedProperties: [
              {
                ProductTitle: "Fixture game",
                Images: [
                  {
                    Uri: "//store-images.s-microsoft.com/large",
                    ImagePurpose: "Poster",
                  },
                ],
              },
            ],
            DisplaySkuAvailabilities: [
              {
                Availabilities: [
                  {
                    OrderManagementData: {
                      Price: { CurrencyCode: "ZAR", ListPrice: 0 },
                    },
                  },
                ],
              },
            ],
          },
        ],
        TotalResultCount: 8,
        HasMorePages: true,
      }),
    );
  };
  try {
    const result = await publicCatalogue("xbox", { ...filters, page: 2 });
    assert.equal(result.data[0].price, null);
    assert.equal(result.data[0].score, null);
    assert.equal(
      result.data[0].cover,
      "https://store-images.s-microsoft.com/large",
    );
    assert.equal(result.meta.hasMore, true);
  } finally {
    globalThis.fetch = original;
  }
});

test("Nintendo group filters retain Switch games and exclude foreign regional prices", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        response: {
          numFound: 1,
          start: 0,
          docs: [
            {
              fs_id: "9001",
              title: "Fixture Nintendo game",
              url: "/en-gb/Games/Fixture-9001.html",
              system_names_txt: ["Nintendo Switch"],
              image_url_sq_s: "https://assets.nintendo.eu/large.jpg",
              price_lowest_f: 19.99,
              excerpt: "Description",
            },
          ],
        },
      }),
    );
  try {
    const result = await publicCatalogue("nintendo", {
      ...filters,
      platform: "Nintendo",
    });
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].price, null);
    assert.deepEqual(result.data[0].platforms, ["Nintendo Switch"]);
    assert.match(result.meta.scope, /UK/);
  } finally {
    globalThis.fetch = original;
  }
});

test("Epic only includes base-game promotions, preserves minor-unit scale and missing prices", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          Catalog: {
            searchStore: {
              elements: [
                {
                  id: "epicfixture",
                  title: "Fixture promotion",
                  offerType: "BASE_GAME",
                  keyImages: [
                    {
                      type: "OfferImageTall",
                      url: "https://cdn1.epicgames.com/large.jpg",
                    },
                  ],
                  productSlug: "fixture",
                  price: {
                    totalPrice: {
                      discountPrice: 12345,
                      originalPrice: 20000,
                      currencyCode: "ZAR",
                      currencyInfo: { decimals: 2 },
                    },
                  },
                },
                {
                  id: "addon",
                  title: "Fixture DLC",
                  offerType: "DLC",
                  keyImages: [],
                },
                {
                  id: "unknown",
                  title: "Fixture missing price",
                  offerType: "BASE_GAME",
                  keyImages: [],
                },
              ],
            },
          },
        },
      }),
    );
  try {
    const result = await publicCatalogue("epic", {
      ...filters,
      search: "",
      limit: 24,
    });
    assert.equal(result.data.length, 2);
    assert.equal(result.data[0].price, 123.45);
    assert.equal(result.data[1].price, null);
    assert.match(result.meta.scope, /promotions feed only/);
    assert.equal(result.meta.hasMore, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("unavailable store and limited feeds expose honest coverage", () => {
  const sources = catalogueSources();
  assert.equal(sources.find((s) => s.id === "playstation")?.available, false);
  assert.equal(sources.find((s) => s.id === "epic")?.coverage, "promotions");
  assert.equal(sources.find((s) => s.id === "nintendo")?.prices, false);
});

test("missing products return not found and malformed storefront data is rejected", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).includes("products/999991")
      ? new Response("{}", { status: 404 })
      : new Response(
          JSON.stringify({ products: "invalid", productCount: 5, pages: 1 }),
        );
  try {
    assert.equal(await publicGame("gog-999991"), null);
    await assert.rejects(() =>
      publicCatalogue("gog", { ...filters, search: "malformed-fixture" }),
    );
    assert.equal(await publicGame("gog-invalid-id"), null);
  } finally {
    globalThis.fetch = original;
  }
});

test("Xbox PC uses Windows Desktop paging and remains distinct from the console listing of the same game", async () => {
  const original = globalThis.fetch;
  const platforms: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const details =
      url.pathname.endsWith("/products") &&
      !url.pathname.includes("productFamilies");
    if (!details) {
      platforms.push(url.searchParams.get("platformDependencyName")!);
      assert.equal(url.searchParams.get("$skip"), "4");
      assert.equal(url.searchParams.get("$top"), "2");
    }
    const product = {
      ProductId: "9PCPCPCPCPCP",
      LocalizedProperties: [
        {
          ProductTitle: "PC fixture",
          ProductDescription: details ? "Full PC description" : undefined,
          Images: [],
        },
      ],
    };
    return new Response(
      JSON.stringify({
        Products: [product],
        TotalResultCount: 10,
        HasMorePages: true,
      }),
    );
  };
  try {
    const pc = await publicCatalogue("xboxpc", {
      ...filters,
      search: "pc-only-fixture",
      page: 3,
      platform: "PC",
    });
    const console = await publicCatalogue("xbox", {
      ...filters,
      search: "pc-only-fixture",
      page: 3,
      platform: "Xbox",
    });
    assert.deepEqual(platforms, ["Windows.Desktop", "Windows.Xbox"]);
    assert.notEqual(pc.data[0].slug, console.data[0].slug);
    assert.equal(pc.data[0].store, "Xbox PC");
    assert.deepEqual(pc.data[0].platforms, ["PC"]);
    const detail = await publicGame(pc.data[0].slug);
    assert.equal(detail?.description, "Full PC description");
    assert.deepEqual(detail?.platforms, ["PC"]);
    assert.equal(detail?.slug, "xboxpc-9PCPCPCPCPCP");
  } finally {
    globalThis.fetch = original;
  }
});
