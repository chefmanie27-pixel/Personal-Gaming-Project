import { test } from "node:test";
import assert from "node:assert/strict";
import { gameRelated, steamBundleIds } from "../src/integrations/related.js";

test("Steam bundles are sourced from the purchase area, not recommendations", () => {
  assert.deepEqual(
    steamBundleIds(
      '<div class="game_area_purchase_game_wrapper dynamic_bundle_description" data-ds-bundleid="500"></div><div data-ds-bundleid="600" class="recommendation"></div><div data-ds-bundleid="500" class="game_area_purchase_game_wrapper"></div>',
    ),
    [500],
  );
});

test("Steam DLC accepts string parent IDs, paginates, and excludes another games add-on", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const id = new URL(String(input)).searchParams.get("appids")!;
    return new Response(
      JSON.stringify({
        [id]:
          id === "600001"
            ? {
                success: true,
                data: { name: "Fixture", dlc: [600002, 600003, 600004] },
              }
            : {
                success: true,
                data: {
                  name: "DLC " + id,
                  type: "dlc",
                  fullgame: { appid: id === "600003" ? "999999" : "600001" },
                },
              },
      }),
    );
  };
  try {
    const first = await gameRelated("steam-600001", "dlc", 1, 2);
    assert.equal(first?.data.length, 1);
    assert.equal(first?.data[0].title, "DLC 600002");
    assert.equal(first?.meta.partial, true);
    assert.equal(first?.meta.hasMore, true);
    const last = await gameRelated("steam-600001", "dlc", 2, 2);
    assert.equal(last?.data[0].id, "steam-app-600004");
    assert.equal(last?.meta.hasMore, false);
    assert.equal(last?.meta.total, 3);
  } finally {
    globalThis.fetch = original;
  }
});

test("Steam editions expose verified bundles and package options using external store URLs", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/app/"))
      return new Response(
        '<div class="game_area_purchase_game_wrapper" data-ds-bundleid="650001"></div>',
      );
    if (url.includes("IStoreBrowseService"))
      return new Response(
        JSON.stringify({
          response: {
            store_items: [
              { id: 650001, name: "Fixture Ultimate Edition", success: 1 },
            ],
          },
        }),
      );
    return new Response(
      JSON.stringify({
        "650000": {
          success: true,
          data: {
            name: "Fixture",
            package_groups: [
              {
                subs: [
                  { packageid: 650002, option_text: "Standard option" },
                  { packageid: 650003, option_text: "Deluxe option" },
                ],
              },
            ],
          },
        },
      }),
    );
  };
  try {
    const result = await gameRelated("steam-650000", "editions");
    assert.equal(result?.data.length, 3);
    assert.equal(
      result?.data.find((p) => p.kind === "bundle")?.title,
      "Fixture Ultimate Edition",
    );
    assert.ok(
      result?.data.every((p) =>
        p.url.startsWith("https://store.steampowered.com/"),
      ),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("GOG packs resolve DLC through explicit included-game relationships and filter unsafe links", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/v2/games/700001"))
      return new Response(
        JSON.stringify({
          _links: {
            includesGames: [
              { href: "https://api.gog.com/v2/games/700002?locale=en-US" },
              { href: "https://untrusted.example/v2/games/700099" },
            ],
          },
          _embedded: {
            editions: [
              {
                id: 700001,
                name: "Current edition",
                _links: { self: { href: "https://www.gog.com/game/current" } },
              },
              {
                id: 700005,
                name: "Ultimate edition",
                _links: { self: { href: "https://www.gog.com/game/ultimate" } },
              },
              {
                id: 700006,
                name: "Unsafe edition",
                _links: { self: { href: "javascript:alert(1)" } },
              },
            ],
          },
        }),
      );
    if (url.includes("/products?ids="))
      return new Response(
        JSON.stringify([
          {
            id: 700003,
            title: "Expansion",
            links: { product_card: "https://www.gog.com/game/expansion" },
          },
          {
            id: 700004,
            title: "Wrong host",
            links: { product_card: "https://untrusted.example/game" },
          },
        ]),
      );
    const base = url.includes("/products/700002");
    return new Response(
      JSON.stringify({
        id: base ? 700002 : 700001,
        title: "Fixture",
        links: { product_card: "https://www.gog.com/game/current" },
        dlcs: base ? { products: [{ id: 700003 }, { id: 700004 }] } : [],
      }),
    );
  };
  try {
    const versions = await gameRelated("gog-700001", "editions");
    assert.equal(versions?.data.length, 1);
    assert.equal(versions?.data[0].title, "Ultimate edition");
    const dlc = await gameRelated("gog-700001", "dlc");
    assert.equal(dlc?.data.length, 1);
    assert.equal(dlc?.data[0].title, "Expansion");
    assert.equal(dlc?.meta.partial, true);
    assert.ok(!urls.some((url) => url.includes("untrusted.example")));
  } finally {
    globalThis.fetch = original;
  }
});

test("Xbox PC add-ons preserve platform requests and show incomplete feeds as a preview", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.match(String(input), /deviceFamily=Windows.Desktop/);
    return new Response(
      JSON.stringify({
        Payload: {
          AddOns: [{ ProductId: "9DLCRELATED1", Title: "Expansion" }],
          TotalItems: 12,
        },
      }),
    );
  };
  try {
    const addons = await gameRelated("xboxpc-9GAMEBASE001", "dlc");
    assert.equal(addons?.data[0].title, "Expansion");
    assert.equal(addons?.meta.partial, true);
    assert.equal(addons?.meta.hasMore, false);
    const editions = await gameRelated("xboxpc-9GAMEBASE001", "editions");
    assert.equal(editions?.meta.supported, false);
    assert.match(editions?.meta.storeUrl ?? "", /xbox.com/);
  } finally {
    globalThis.fetch = original;
  }
});

test("unsupported storefronts have a fallback state and invalid game IDs are rejected", async () => {
  assert.equal(
    (await gameRelated("epic-fixture", "editions"))?.meta.supported,
    false,
  );
  assert.equal(await gameRelated("steam-invalid", "dlc"), null);
  assert.equal(await gameRelated("https://untrusted.example", "dlc"), null);
});
