import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOwned, steamRequest } from "../src/steamLibrary.js";
import { config } from "../src/config.js";
test("Steam owned-game responses distinguish private, empty, malformed and duplicate libraries", () => {
  assert.deepEqual(parseOwned({ response: { game_count: 0 } }), []);
  assert.throws(() => parseOwned({ response: {} }), /private or unavailable/);
  assert.throws(
    () => parseOwned({ response: { games: [{ appid: 1 }] } }),
    /incomplete/,
  );
  assert.throws(
    () =>
      parseOwned({
        response: { game_count: 2, games: [{ appid: 1, name: "One" }] },
      }),
    /incomplete/,
  );
  assert.equal(
    parseOwned({
      response: {
        games: [
          { appid: 1, name: "One", playtime_forever: 120 },
          { appid: 1, name: "One", playtime_forever: 120 },
        ],
      },
    }).length,
    1,
  );
});
test("Steam requests use the official HTTPS API, server credentials, timeout and safe failure messages", async () => {
  const old = config.STEAM_WEB_API_KEY;
  try {
    config.STEAM_WEB_API_KEY = undefined;
    await assert.rejects(
      () => steamRequest("IPlayerService/GetOwnedGames/v1/", {}),
      /not configured/,
    );
    config.STEAM_WEB_API_KEY = "fixture-key";
    let called = false;
    await steamRequest(
      "IPlayerService/GetOwnedGames/v1/",
      { steamid: "76561198000000000" },
      async (input, init) => {
        const u = new URL(String(input));
        assert.equal(u.origin, "https://api.steampowered.com");
        assert.equal(u.searchParams.get("key"), "fixture-key");
        assert.ok(init?.signal);
        called = true;
        return new Response(JSON.stringify({ response: { game_count: 0 } }));
      },
    );
    assert.ok(called);
    await assert.rejects(
      () =>
        steamRequest(
          "x",
          {},
          async () => new Response("secret raw error", { status: 403 }),
        ),
      /temporarily unavailable/,
    );
  } finally {
    config.STEAM_WEB_API_KEY = old;
  }
});

test(
  "MySQL verified Steam linking, private libraries, repeat imports, manual data preservation and disconnect",
  { skip: process.env.GAMEVAULT_DATABASE_TESTS !== "1" },
  async () => {
    const { prisma } = await import("../src/db.js");
    const { steamAuth } = await import("../src/steamAuth.js");
    const { steamLibrary } = await import("../src/steamLibrary.js");
    const { issueToken } = await import("../src/auth.js");
    const { randomUUID } = await import("node:crypto");
    const { default: express } = await import("express");
    const users: string[] = [];
    const tokens: string[] = [];
    const originalFetch = globalThis.fetch,
      oldKey = config.STEAM_WEB_API_KEY;
    let isPrivate = false;
    const steamId =
      "7656119" +
      String(Math.floor(Math.random() * 10000000000)).padStart(10, "0");
    const app = express();
    app.use(express.json());
    app.use("/api/auth", steamAuth);
    app.use("/steam", steamLibrary);
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = "http://127.0.0.1:" + address.port;
    async function api(path: string, who = 0, method = "GET", body?: unknown) {
      const r = await originalFetch(base + path, {
        method,
        headers: {
          Authorization: "Bearer " + tokens[who],
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, body: await r.json() };
    }
    async function link(who: number) {
      const ticket = (await api("/api/auth/steam/link-ticket", who, "POST", {}))
        .body.url;
      const u = new URL(ticket);
      const start = await originalFetch(base + u.pathname + u.search, {
        redirect: "manual",
      });
      const login = new URL(start.headers.get("location")!),
        returnTo = login.searchParams.get("openid.return_to")!,
        state = new URL(returnTo).searchParams.get("state")!;
      const q = new URLSearchParams({
        state,
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "id_res",
        "openid.op_endpoint": "https://steamcommunity.com/openid/login",
        "openid.return_to": returnTo,
        "openid.claimed_id": "https://steamcommunity.com/openid/id/" + steamId,
        "openid.identity": "https://steamcommunity.com/openid/id/" + steamId,
        "openid.signed":
          "op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
        "openid.response_nonce": new Date().toISOString() + "fixture",
        "openid.assoc_handle": "test",
        "openid.sig": "test",
      });
      return originalFetch(base + "/api/auth/steam/callback?" + q, {
        redirect: "manual",
        headers: { Cookie: start.headers.get("set-cookie")!.split(";")[0] },
      });
    }
    try {
      for (let i = 0; i < 2; i++) {
        const user = await prisma.user.create({
          data: {
            email: "steam-sync-test-" + randomUUID() + "@example.invalid",
            passwordHash: "disabled",
          },
        });
        users.push(user.id);
        tokens.push(issueToken(user));
      }
      config.STEAM_WEB_API_KEY = "fixture-key";
      globalThis.fetch = async (input, init) => {
        const u = new URL(String(input));
        if (u.origin === "https://steamcommunity.com")
          return new Response("is_valid:true\n");
        if (u.origin === "https://api.steampowered.com") {
          assert.equal(u.searchParams.get("steamid"), steamId);
          if (u.pathname.includes("GetOwnedGames"))
            return new Response(
              JSON.stringify(
                isPrivate
                  ? { response: {} }
                  : {
                      response: {
                        game_count: 2,
                        games: [
                          { appid: 440, name: "Manual", playtime_forever: 120 },
                          { appid: 570, name: "New", playtime_forever: 180 },
                        ],
                      },
                    },
              ),
            );
          return new Response(
            JSON.stringify({
              playerstats: {
                success: true,
                achievements: [
                  {
                    apiname: "FIRST",
                    achieved: 1,
                    unlocktime: 123,
                    name: "First",
                  },
                ],
              },
            }),
          );
        }
        return originalFetch(input, init);
      };
      assert.match((await link(0)).headers.get("location")!, /steam_linked=1/);
      assert.equal((await api("/steam")).body.data.steamId, steamId);
      assert.match((await link(1)).headers.get("location")!, /steam_error=1/);
      assert.equal((await api("/steam", 1)).body.data, null);
      await prisma.libraryEntry.create({
        data: {
          userId: users[0],
          slug: "steam-440",
          game: { id: "steam-440", slug: "steam-440", title: "Manual" },
          hours: 99,
          notes: "Keep my notes",
          status: "Completed",
          favorite: true,
          rating: 9,
        },
      });
      const first = await api("/steam/sync", 0, "POST", {});
      assert.equal(first.status, 200);
      assert.equal(first.body.added, 1);
      const manual = await prisma.libraryEntry.findUniqueOrThrow({
        where: { userId_slug: { userId: users[0], slug: "steam-440" } },
      });
      assert.equal(manual.hours, 99);
      assert.equal(manual.notes, "Keep my notes");
      assert.equal(manual.status, "Completed");
      assert.equal(manual.favorite, true);
      assert.equal(manual.rating, 9);
      assert.equal((await api("/steam/sync", 0, "POST", {})).body.added, 0);
      assert.equal(
        await prisma.libraryEntry.count({ where: { userId: users[0] } }),
        2,
      );
      assert.equal(
        (await api("/steam/achievements/440", 0, "POST", {})).status,
        200,
      );
      assert.ok(
        (
          await prisma.steamGameSnapshot.findUniqueOrThrow({
            where: { userId_appId: { userId: users[0], appId: 440 } },
          })
        ).achievements,
      );
      assert.equal(
        (await api("/steam/achievements/440", 1, "POST", {})).status,
        409,
      );
      isPrivate = true;
      assert.equal((await api("/steam/sync", 0, "POST", {})).status, 502);
      assert.equal(
        await prisma.libraryEntry.count({ where: { userId: users[0] } }),
        2,
      );
      await api("/steam", 0, "DELETE");
      assert.equal((await api("/steam")).body.data, null);
      assert.equal(
        await prisma.steamGameSnapshot.count({ where: { userId: users[0] } }),
        0,
      );
      assert.equal(
        await prisma.libraryEntry.count({ where: { userId: users[0] } }),
        2,
      );
    } finally {
      globalThis.fetch = originalFetch;
      config.STEAM_WEB_API_KEY = oldKey;
      await new Promise<void>((r) => server.close(() => r()));
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.$disconnect();
    }
  },
);
