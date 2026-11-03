import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createAlertsRouter, createAlertSchema } from "../src/alerts.js";
import { issueToken } from "../src/auth.js";
import { reconcileObservation } from "../src/observations.js";
import type { SteamGame } from "../src/integrations/steam.js";
async function server() {
  const app = express();
  app.use(express.json());
  app.use("/alerts", createAlertsRouter());
  app.use(
    (
      e: unknown,
      _q: express.Request,
      r: express.Response,
      _n: express.NextFunction,
    ) => {
      console.error(e instanceof Error ? e.name : "error");
      r.status(500).json({ error: "Test failure" });
    },
  );
  const s = app.listen(0);
  await new Promise<void>((r) => s.once("listening", r));
  const a = s.address();
  assert.ok(a && typeof a !== "string");
  return { s, base: "http://127.0.0.1:" + a.port + "/alerts" };
}
test("alert targets require bounded exact cents, ZAR and strict ownership-free input", () => {
  const value = { gameSlug: "steam-440", target: 99.99 };
  assert.equal(createAlertSchema.safeParse(value).success, true);
  for (const target of [0, -1, NaN, Infinity, 0.001, 10000000000, 99.999])
    assert.equal(
      createAlertSchema.safeParse({ ...value, target }).success,
      false,
    );
  for (const extra of [
    { currency: "USD" },
    { userId: "other" },
    { active: false },
  ])
    assert.equal(
      createAlertSchema.safeParse({ ...value, ...extra }).success,
      false,
    );
});
test("alert endpoints require authentication before database access", async () => {
  const { s, base } = await server();
  try {
    for (const [path, method] of [
      ["", "GET"],
      ["", "POST"],
      ["/anything", "PATCH"],
      ["/anything", "DELETE"],
    ])
      assert.equal((await fetch(base + path, { method })).status, 401);
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
  }
});
test(
  "MySQL alert creates serialize across router instances, preserve paused rules, and isolate accounts",
  { skip: process.env.GAMEVAULT_DATABASE_TESTS !== "1" },
  async () => {
    const { prisma } = await import("../src/db.js");
    const first = await server(),
      second = await server(),
      ids: string[] = [],
      tokens: string[] = [];
    const slug = "steam-" + Date.now();
    async function api(
      base: string,
      who: number,
      method = "POST",
      body?: unknown,
      path = "",
    ) {
      const r = await fetch(base + path, {
        method,
        headers: {
          Authorization: "Bearer " + tokens[who],
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: r.status,
        body: r.status === 204 ? null : await r.json(),
      };
    }
    try {
      for (let i = 0; i < 2; i++) {
        const u = await prisma.user.create({
          data: {
            email: "alert-" + randomUUID() + "@example.invalid",
            passwordHash: "disabled",
          },
        });
        ids.push(u.id);
        tokens.push(issueToken(u));
      }
      const game = {
        id: slug,
        slug,
        title: "Alert fixture",
        description: "Fixture",
        cover: "https://example.invalid/a.jpg",
        hero: "https://example.invalid/a.jpg",
        tagline: "Fixture",
        developer: "Fixture",
        publisher: "Fixture",
        score: null,
        genres: [],
        platforms: ["PC"],
        releaseDate: "",
        reviewCount: "",
        price: 100,
        store: "Steam",
        storeUrl: "https://store.steampowered.com/app/" + slug.slice(6),
        featured: false,
        status: "released",
        sourceType: "steam",
        observedAt: new Date().toISOString(),
      } as SteamGame;
      const listing = await reconcileObservation(game, slug);
      const payload = { gameSlug: slug, target: 85.25 };
      const concurrent = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          api(i % 2 ? first.base : second.base, 0, "POST", payload),
        ),
      );
      assert.equal(concurrent.filter((r) => r.status === 201).length, 1);
      assert.equal(concurrent.filter((r) => r.status === 200).length, 7);
      assert.equal(new Set(concurrent.map((r) => r.body.data.id)).size, 1);
      const id = concurrent[0].body.data.id;
      assert.equal(
        await prisma.priceAlert.count({
          where: { userId: ids[0], listingId: listing.listingId },
        }),
        1,
      );
      const time = new Date("2026-01-01T12:00:00.000Z");
      await prisma.priceAlert.update({
        where: { id },
        data: { active: false, lastTriggered: time },
      });
      const workspace = {
        preferences: {
          genres: [],
          platforms: [],
          priceAlertRules: {
            [id]: { mode: "percentage", percent: 25, cooldownHours: 48 },
          },
        },
      };
      await prisma.userWorkspace.create({
        data: { userId: ids[0], data: workspace, journalMigrated: true },
      });
      const retry = await api(first.base, 0, "POST", payload);
      assert.equal(retry.body.existing, true);
      assert.equal(retry.body.data.active, false);
      assert.equal(retry.body.data.lastTriggered, time.toISOString());
      assert.deepEqual(
        (
          await prisma.userWorkspace.findUniqueOrThrow({
            where: { userId: ids[0] },
          })
        ).data,
        workspace,
      );
      const other = await api(first.base, 1, "POST", payload);
      assert.equal(other.status, 201);
      assert.notEqual(other.body.data.id, id);
      const target = await api(first.base, 0, "POST", {
        ...payload,
        target: 80,
      });
      assert.equal(target.status, 201);
      assert.equal(
        (
          await api(
            first.base,
            0,
            "PATCH",
            { target: 85.25 },
            "/" + target.body.data.id,
          )
        ).status,
        409,
      );
      for (const method of ["PATCH", "DELETE"])
        assert.equal(
          (
            await api(
              first.base,
              1,
              method,
              method === "PATCH" ? { active: true } : undefined,
              "/" + id,
            )
          ).status,
          404,
        );
      assert.equal(
        (await api(first.base, 0, "PATCH", { active: true }, "/" + id)).status,
        204,
      );
      const own = await api(first.base, 1, "GET");
      assert.deepEqual(
        own.body.data.map((r: any) => r.id),
        [other.body.data.id],
      );
      assert.equal(
        (await api(first.base, 0, "POST", { ...payload, userId: ids[1] }))
          .status,
        400,
      );
      assert.equal(
        (await api(first.base, 0, "POST", { ...payload, gameSlug: "steam-0" }))
          .status,
        404,
      );
      assert.equal(
        (await api(first.base, 0, "DELETE", undefined, "/" + id)).status,
        204,
      );
      assert.equal((await api(first.base, 0, "POST", payload)).status, 201);
      await prisma.user.delete({ where: { id: ids[1] } });
      assert.equal((await api(first.base, 1, "POST", payload)).status, 401);
    } finally {
      await Promise.all(
        [first.s, second.s].map(
          (s) => new Promise<void>((r) => s.close(() => r())),
        ),
      );
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.game.deleteMany({ where: { slug } });
      await prisma.$disconnect();
    }
  },
);
