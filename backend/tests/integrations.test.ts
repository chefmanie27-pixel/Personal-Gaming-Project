import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { steamPage } from "../src/integrations/steam.js";
import { steamAuth } from "../src/steamAuth.js";

test("Steam pagination uses infinite JSON, deduplicates IDs, preserves unknown prices and scores", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/search/results/"))
      return new Response(
        JSON.stringify({
          total_count: 5,
          start: 0,
          results_html:
            '<a data-ds-appid="101"></a><a data-ds-appid="102"></a><a data-ds-appid="103"></a><a data-ds-appid="104"></a><a data-ds-appid="105"></a>',
        }),
      );
    if (url.includes("IStoreBrowseService"))
      return new Response(
        JSON.stringify({
          response: {
            store_items: [
              {
                id: 101,
                assets: {
                  asset_url_format: "steam/apps/101/" + "$" + "{FILENAME}",
                  library_capsule_2x: "library_600x900_2x.jpg",
                },
              },
            ],
          },
        }),
      );
    const id = new URL(url).searchParams.get("appids")!;
    return new Response(
      JSON.stringify({
        [id]: {
          success: true,
          data: {
            type: "game",
            name: "Game " + id,
            header_image: "https://example.com/header.jpg",
            is_free: id === "101",
            metacritic: id === "101" ? { score: 82 } : undefined,
          },
        },
      }),
    );
  };
  try {
    const result = await steamPage("test & query", 1, 2, "price");
    assert.equal(result.data.length, 2);
    assert.equal(result.hasMore, true);
    assert.equal(result.total, 5);
    const url = new URL(urls[0]);
    assert.equal(url.searchParams.get("start"), "0");
    assert.equal(url.searchParams.get("infinite"), "1");
    assert.equal(url.searchParams.get("term"), "test & query");
    assert.equal(result.data[0].price, 0);
    assert.equal(result.data[1].price, null);
    assert.equal(result.data[1].score, null);
    assert.match(result.data[0].cover, /library_600x900_2x/);
    assert.equal(
      (await steamPage("test & query", 3, 2, "price")).hasMore,
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("Steam login redirects to Valve and rejects forged callbacks and exchange codes", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", steamAuth);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  try {
    const start = await fetch(base + "/api/auth/steam", { redirect: "manual" });
    assert.equal(start.status, 302);
    const location = new URL(start.headers.get("location")!);
    assert.equal(location.origin, "https://steamcommunity.com");
    assert.match(start.headers.get("set-cookie")!, /HttpOnly/);
    const callback = await fetch(
      base + "/api/auth/steam/callback?state=forged",
      { redirect: "manual" },
    );
    assert.match(callback.headers.get("location")!, /steam_error=1/);
    const exchange = await fetch(base + "/api/auth/steam/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "forged" }),
    });
    assert.equal(exchange.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});

test("verified Steam login issues a one-use exchange code, never a token in the redirect", async () => {
  const { prisma } = await import("../src/db.js");
  const { config } = await import("../src/config.js");
  const originalFetch = globalThis.fetch;
  const originalUpsert = prisma.user.upsert;
  let persisted = false;
  prisma.user.upsert = (async (args: unknown) => {
    persisted = true;
    assert.equal(
      (args as { where: { email: string } }).where.email,
      "steam-76561198000000000@steam.gamevault.invalid",
    );
    return { id: "steam-user", role: "USER" };
  }) as typeof prisma.user.upsert;
  globalThis.fetch = (async (input, init) => {
    if (String(input) === "https://steamcommunity.com/openid/login") {
      assert.equal(init?.method, "POST");
      assert.equal(
        (init?.body as URLSearchParams).get("openid.mode"),
        "check_authentication",
      );
      return new Response(
        "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n",
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  const app = express();
  app.use(express.json());
  app.use("/api/auth", steamAuth);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  try {
    const start = await fetch(base + "/api/auth/steam", { redirect: "manual" });
    const login = new URL(start.headers.get("location")!);
    const returnTo = login.searchParams.get("openid.return_to")!;
    const state = new URL(returnTo).searchParams.get("state")!;
    const q = new URLSearchParams({
      state,
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "id_res",
      "openid.op_endpoint": "https://steamcommunity.com/openid/login",
      "openid.return_to": returnTo,
      "openid.identity":
        "https://steamcommunity.com/openid/id/76561198000000000",
      "openid.claimed_id":
        "https://steamcommunity.com/openid/id/76561198000000000",
      "openid.signed":
        "op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
      "openid.response_nonce": new Date().toISOString() + "nonce",
      "openid.assoc_handle": "test",
      "openid.sig": "test",
    });
    const callback = await fetch(base + "/api/auth/steam/callback?" + q, {
      redirect: "manual",
      headers: { Cookie: start.headers.get("set-cookie")!.split(";")[0] },
    });
    const redirect = new URL(callback.headers.get("location")!);
    assert.equal(redirect.origin, new URL(config.FRONTEND_ORIGIN).origin);
    assert.equal(persisted, true);
    assert.doesNotMatch(redirect.href, /token=/);
    const code = new URLSearchParams(redirect.hash.slice(1)).get("steam_code");
    assert.ok(code);
    const exchange = () =>
      fetch(base + "/api/auth/steam/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
    const response = await exchange();
    assert.equal(response.status, 200);
    assert.ok((await response.json()).data.token);
    assert.equal((await exchange()).status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    prisma.user.upsert = originalUpsert;
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});

test("client pages crossing Steam windows do not repeat or skip games", async () => {
  const original = globalThis.fetch;
  const starts: number[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/search/results")) {
      const start = Number(url.searchParams.get("start"));
      starts.push(start);
      assert.equal(start % 50, 0);
      assert.equal(url.searchParams.get("count"), "50");
      return new Response(
        JSON.stringify({
          total_count: 1000,
          start,
          results_html: Array.from(
            { length: 50 },
            (_, i) => '<a data-ds-appid="' + (200 + start + i) + '"></a>',
          ).join(""),
        }),
      );
    }
    if (url.pathname.includes("IStoreBrowseService"))
      return new Response(JSON.stringify({ response: { store_items: [] } }));
    const id = url.searchParams.get("appids")!;
    return new Response(
      JSON.stringify({
        [id]: {
          success: true,
          data: {
            type: "game",
            name: id,
            header_image: "https://example.com/header.jpg",
            is_free: false,
          },
        },
      }),
    );
  };
  try {
    const a = await steamPage("boundary-check", 2, 24, "featured");
    const b = await steamPage("boundary-check", 3, 24, "featured");
    assert.deepEqual(
      a.data.map((g) => g.id),
      Array.from({ length: 24 }, (_, i) => "steam-" + (224 + i)),
    );
    assert.deepEqual(
      b.data.map((g) => g.id),
      Array.from({ length: 24 }, (_, i) => "steam-" + (248 + i)),
    );
    assert.deepEqual(starts, [0, 50]);
  } finally {
    globalThis.fetch = original;
  }
});

test("RAWG uses actual critic scores, unknown prices, console platforms and safe store links", async () => {
  const { config } = await import("../src/config.js");
  const { rawgCatalogue, rawgDetail } =
    await import("../src/integrations/storefronts.js");
  const original = globalThis.fetch;
  const key = config.RAWG_API_KEY;
  config.RAWG_API_KEY = "test-key";
  const fixture = {
    id: 123,
    name: "Console game",
    released: "2020-01-01",
    metacritic: 81,
    rating: 4.9,
    platforms: [{ platform: { name: "PlayStation 5" } }],
    genres: [{ name: "RPG" }],
    background_image: "https://example.com/large.jpg",
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("key"), "test-key");
    if (url.pathname.endsWith("/stores"))
      return new Response(
        JSON.stringify({
          results: [
            { url: "https://store.playstation.com/product/example" },
            { url: "javascript:alert(1)" },
          ],
        }),
      );
    if (url.pathname.endsWith("/games/123"))
      return new Response(JSON.stringify(fixture));
    assert.equal(url.searchParams.get("parent_platforms"), "2");
    assert.equal(url.searchParams.get("metacritic"), "80,100");
    return new Response(
      JSON.stringify({ results: [fixture], count: 1, next: null }),
    );
  };
  try {
    const result = await rawgCatalogue({
      search: "",
      page: 1,
      limit: 24,
      sort: "score",
      platform: "PlayStation",
      genre: "",
      minScore: 80,
    });
    assert.equal(result.data[0].score, 81);
    assert.equal(result.data[0].price, null);
    assert.deepEqual(result.data[0].platforms, ["PlayStation 5"]);
    const detail = await rawgDetail("rawg-123");
    assert.deepEqual(detail?.storeLinks, [
      "https://store.playstation.com/product/example",
    ]);
  } finally {
    globalThis.fetch = original;
    config.RAWG_API_KEY = key;
  }
});
