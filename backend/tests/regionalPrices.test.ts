import { test } from "node:test";
import assert from "node:assert/strict";
import {
  microsoftPrice,
  nintendoPrices,
} from "../src/integrations/regionalPrices.js";
import {
  publicCatalogue,
  publicGame,
} from "../src/integrations/publicStores.js";
const now = Date.parse("2026-11-02T12:00:00Z");
const offer = (price: number, extra: Record<string, unknown> = {}) => ({
  Actions: ["Purchase"],
  Markets: ["ZA"],
  Conditions: {
    StartDate: "2026-10-01T00:00:00Z",
    EndDate: "2026-12-01T00:00:00Z",
    ClientConditions: { AllowedPlatforms: [{ PlatformName: "Windows.Xbox" }] },
  },
  OrderManagementData: {
    Price: { CurrencyCode: "ZAR", ListPrice: price, MSRP: 1000 },
  },
  ...extra,
});
const full = (offers: unknown[]) => ({
  Sku: { SkuType: "full", Properties: { IsTrial: false } },
  Availabilities: offers,
});
test("Xbox prices exclude subscriptions, trials, foreign currencies, future/expired offers, and incompatible platforms", () => {
  const result = microsoftPrice(
    [
      full([
        offer(500),
        offer(0, { Actions: ["License"] }),
        offer(100, { RemediationRequired: true }),
        offer(200, { Remediations: [{ Type: "Upsell" }] }),
        offer(1, { Markets: ["US"] }),
        offer(2, {
          OrderManagementData: { Price: { CurrencyCode: "USD", ListPrice: 2 } },
        }),
        offer(3, {
          Conditions: {
            StartDate: "2027-01-01",
            ClientConditions: {
              AllowedPlatforms: [{ PlatformName: "Windows.Xbox" }],
            },
          },
        }),
        offer(4, {
          Conditions: {
            EndDate: "2025-01-01",
            ClientConditions: {
              AllowedPlatforms: [{ PlatformName: "Windows.Xbox" }],
            },
          },
        }),
      ]),
      {
        Sku: { SkuType: "full", Properties: { IsTrial: true } },
        Availabilities: [offer(0)],
      },
      {
        Sku: { SkuType: "full", SubscriptionPolicyId: "subscription" },
        Availabilities: [offer(0)],
      },
    ],
    "Windows.Xbox",
    now,
  );
  assert.deepEqual(result, { price: 500, originalPrice: 1000 });
  assert.equal(
    microsoftPrice([full([offer(500)])], "Windows.Desktop", now).price,
    null,
  );
  assert.equal(
    microsoftPrice([full([offer(0)])], "Windows.Xbox", now).price,
    0,
  );
});
test("Nintendo joins exact product IDs, uses active ZA discounts, and rejects foreign, personalized or unavailable quotes", () => {
  const regular = { currency: "ZAR", raw_value: "400" };
  const payload = {
    country: "ZA",
    personalized: false,
    prices: [
      {
        title_id: 70010000111111,
        sales_status: "onsale",
        regular_price: regular,
        discount_price: {
          currency: "ZAR",
          raw_value: "99.95",
          start_datetime: "2026-10-01",
          end_datetime: "2026-12-01",
        },
      },
      {
        title_id: 70010000111112,
        sales_status: "onsale",
        regular_price: regular,
        discount_price: {
          currency: "ZAR",
          raw_value: "1",
          start_datetime: "2027-01-01",
        },
      },
      {
        title_id: 70010000111113,
        sales_status: "not_found",
        regular_price: regular,
      },
      {
        title_id: 70010000111114,
        sales_status: "onsale",
        regular_price: { currency: "GBP", raw_value: "19.99" },
      },
      {
        title_id: 70010000111115,
        sales_status: "onsale",
        regular_price: regular,
        discount_price: {
          currency: "ZAR",
          raw_value: "1",
          end_datetime: "2025-01-01",
        },
      },
    ],
  };
  const quotes = nintendoPrices(payload, now);
  assert.deepEqual(quotes.get("70010000111111"), {
    price: 99.95,
    originalPrice: 400,
  });
  assert.equal(quotes.get("70010000111112")?.price, 400);
  assert.equal(quotes.get("70010000111115")?.price, 400);
  assert.equal(quotes.has("70010000111113"), false);
  assert.equal(quotes.has("70010000111114"), false);
  assert.equal(nintendoPrices({ ...payload, country: "GB" }, now).size, 0);
  assert.equal(nintendoPrices({ ...payload, personalized: true }, now).size, 0);
});
const filters = {
  search: "regional-price-fixture",
  page: 1,
  limit: 2,
  sort: "featured",
  genre: "",
  platform: "",
};
test("Nintendo hydrates both catalogue and direct game detail prices by primary NSUID", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.ec.nintendo.com") {
      assert.equal(url.searchParams.get("country"), "ZA");
      assert.equal(url.searchParams.get("ids"), "70010000122222");
      return new Response(
        JSON.stringify({
          country: "ZA",
          personalized: false,
          prices: [
            {
              title_id: 70010000122222,
              sales_status: "onsale",
              regular_price: { currency: "ZAR", raw_value: "299.95" },
            },
          ],
        }),
      );
    }
    return new Response(
      JSON.stringify({
        response: {
          numFound: 1,
          start: 0,
          docs: [
            {
              fs_id: "912345",
              title: "NSUID fixture",
              url: "/en-gb/Games/fixture.html",
              nsuid_txt: ["70010000122222", "70010000999999"],
            },
          ],
        },
      }),
    );
  };
  try {
    const page = await publicCatalogue("nintendo", filters);
    assert.equal(page.data[0].price, 299.95);
    assert.equal((await publicGame("nintendo-912345"))?.price, 299.95);
  } finally {
    globalThis.fetch = original;
  }
});
test("Xbox catalogue hydrates missing SKU data in one batch and keeps search ordering", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const detail = !url.pathname.includes("productFamilies");
    calls++;
    const product = (id: string) => ({
      ProductId: id,
      LocalizedProperties: [{ ProductTitle: id, Images: [] }],
      ...(detail
        ? {
            DisplaySkuAvailabilities: [
              full([
                offer(650, {
                  Conditions: {
                    ClientConditions: {
                      AllowedPlatforms: [{ PlatformName: "Windows.Xbox" }],
                    },
                  },
                }),
              ]),
            ],
          }
        : {}),
    });
    return new Response(
      JSON.stringify({
        Products: (detail
          ? ["9AAAAAAAAAA2", "9AAAAAAAAAA1"]
          : ["9AAAAAAAAAA1", "9AAAAAAAAAA2"]
        ).map(product),
        TotalResultCount: 2,
        HasMorePages: false,
      }),
    );
  };
  try {
    const result = await publicCatalogue("xbox", {
      ...filters,
      search: "xbox-pricing-fixture",
    });
    assert.equal(calls, 2);
    assert.equal(result.data[0].slug, "xbox-9AAAAAAAAAA1");
    assert.equal(result.data[0].price, 650);
  } finally {
    globalThis.fetch = original;
  }
});
test("Epic full catalogue pagination retains paid games beyond promotions and resolves namespaced deep links", async () => {
  const original = globalThis.fetch;
  let requested = "";
  const product = {
    id: "paidfixture",
    namespace: "namespaceFixture",
    title: "Paid full catalogue fixture",
    offerType: "BASE_GAME",
    description: "Real catalogue fixture",
    keyImages: [],
    productSlug: "paid-fixture",
    price: {
      totalPrice: {
        discountPrice: 12345,
        originalPrice: 20000,
        currencyCode: "ZAR",
        currencyInfo: { decimals: 2 },
      },
    },
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requested = url.searchParams.get("query") ?? "";
    assert.equal(url.pathname, "/graphql");
    return new Response(
      JSON.stringify(
        requested.includes("catalogOffer(")
          ? {
              data: {
                Catalog: { catalogOffer: { ...product, id: "directfixture" } },
              },
            }
          : {
              data: {
                Catalog: {
                  searchStore: {
                    paging: { count: 2, total: 100 },
                    elements: [
                      product,
                      { ...product, id: "dlc", offerType: "DLC" },
                    ],
                  },
                },
              },
            },
      ),
    );
  };
  try {
    const result = await publicCatalogue("epic", {
      ...filters,
      search: "full-epic-fixture",
      page: 3,
    });
    assert.match(requested, /start: 4/);
    assert.equal(result.meta.total, 100);
    assert.equal(result.meta.hasMore, true);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].price, 123.45);
    assert.equal(result.data[0].offerScope, "catalogue");
    const detail = await publicGame("epic-namespaceFixture--directfixture");
    assert.equal(detail?.title, product.title);
  } finally {
    globalThis.fetch = original;
  }
});
test("Epic blocked full catalogue falls back explicitly and avoids repeating the blocked request on the next page", async () => {
  const original = globalThis.fetch;
  let blocked = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes("/graphql?")) {
      blocked++;
      return new Response("Access denied", { status: 403 });
    }
    return new Response(
      JSON.stringify({
        data: {
          Catalog: {
            searchStore: {
              elements: [
                {
                  id: "promofallback",
                  namespace: "legacynamespace",
                  title: "Promo fallback fixture",
                  offerType: "BASE_GAME",
                  keyImages: [],
                },
              ],
            },
          },
        },
      }),
    );
  };
  try {
    const first = await publicCatalogue("epic", {
      ...filters,
      search: "fallback",
    });
    assert.match(first.meta.scope, /not the full list/);
    assert.equal(first.data[0].offerScope, "promotions");
    assert.equal(first.data[0].slug, "epic-promofallback");
    assert.equal(
      (await publicGame("epic-promofallback"))?.slug,
      "epic-promofallback",
    );
    await publicCatalogue("epic", { ...filters, search: "fallback", page: 2 });
    assert.equal(blocked, 1);
  } finally {
    globalThis.fetch = original;
  }
});
