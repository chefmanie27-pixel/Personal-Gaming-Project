import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { prisma } from "../src/db.js";
import {
  claimAlertJob,
  finishAlertJob,
  renewAlertLease,
  LostAlertLease,
  alertJobName,
} from "../src/jobs/alertLease.js";
import { runDurableAlertBatch } from "../src/jobs/durableAlerts.js";
import { evaluatePriceAlerts } from "../src/jobs/priceAlerts.js";
import { createAlertsRouter } from "../src/alerts.js";
import { issueToken } from "../src/auth.js";
import { reconcileObservation } from "../src/observations.js";
import type { SteamGame } from "../src/integrations/steam.js";
async function server(enabled: boolean) {
  const app = express();
  app.use(express.json());
  app.use(createAlertsRouter(prisma, enabled));
  app.use(
    (
      e: unknown,
      _q: express.Request,
      r: express.Response,
      _n: express.NextFunction,
    ) =>
      r
        .status(500)
        .json({ error: e instanceof Error ? e.name : "test failure" }),
  );
  const s = app.listen(0);
  await new Promise<void>((r) => s.once("listening", r));
  const a = s.address();
  assert.ok(a && typeof a !== "string");
  return { s, base: "http://127.0.0.1:" + a.port };
}
test("disabled alert history reports unavailable without reading new tables", async () => {
  const { s, base } = await server(false);
  try {
    const headers = {
      Authorization: "Bearer " + issueToken({ id: "fixture", role: "USER" }),
    };
    assert.equal((await fetch(base + "/deliveries")).status, 401);
    assert.deepEqual(
      await (await fetch(base + "/capabilities", { headers })).json(),
      { history: false },
    );
    assert.equal((await fetch(base + "/deliveries", { headers })).status, 503);
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
  }
});
test(
  "MySQL durable alert ownership, crash recovery, atomic ledger and private paginated history",
  { skip: process.env.GAMEVAULT_DATABASE_TESTS !== "1" },
  async (t) => {
    const ids: string[] = [],
      tokens: string[] = [];
    const slug = "steam-" + (Date.now() + 700000);
    const { s, base } = await server(true);
    let a: string, b: string;
    const due = () =>
      prisma.durableAlertJob.update({
        where: { name: alertJobName },
        data: { nextRunAt: new Date(0) },
      });
    async function history(who: number, path = "/deliveries") {
      const r = await fetch(base + path, {
        headers: { Authorization: "Bearer " + tokens[who] },
      });
      return { status: r.status, body: await r.json() };
    }
    try {
      await prisma.durableAlertJob.deleteMany({
        where: { name: alertJobName },
      });
      for (let i = 0; i < 2; i++) {
        const u = await prisma.user.create({
          data: {
            email: "durable-" + randomUUID() + "@example.invalid",
            passwordHash: "disabled",
          },
        });
        ids.push(u.id);
        tokens.push(issueToken(u));
        await prisma.socialProfile.create({
          data: {
            userId: u.id,
            username: "d" + randomUUID().replaceAll("-", "").slice(0, 20),
            name: "Fixture",
            bio: "",
            avatar: "",
            banner: "",
            settings: { notifications: i === 0 },
          },
        });
      }
      const game = {
        id: slug,
        slug,
        title: "Durable fixture",
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
        price: 80,
        store: "Steam",
        storeUrl: "https://store.steampowered.com/app/" + slug.slice(6),
        featured: false,
        status: "released",
        sourceType: "steam",
        observedAt: new Date().toISOString(),
      } as SteamGame;
      const listing = await reconcileObservation(game, slug);
      a = (
        await prisma.priceAlert.create({
          data: { userId: ids[0], listingId: listing.listingId, target: 90 },
        })
      ).id;
      b = (
        await prisma.priceAlert.create({
          data: { userId: ids[1], listingId: listing.listingId, target: 90 },
        })
      ).id;
      await t.test(
        "one database lease across simultaneous workers and persisted cursor",
        async () => {
          const claims = await Promise.all(
            Array.from({ length: 5 }, () => claimAlertJob()),
          );
          assert.equal(claims.filter(Boolean).length, 1);
          const claim = claims.find(Boolean)!;
          await finishAlertJob(claim.token, "saved-cursor");
          assert.equal(await claimAlertJob(), null);
          await due();
          const restart = await claimAlertJob();
          assert.equal(restart?.cursor, "saved-cursor");
          await finishAlertJob(restart!.token, null);
        },
      );
      await t.test(
        "expired lease is reclaimed and old token cannot renew or finish",
        async () => {
          await due();
          const old = await claimAlertJob();
          assert.ok(old);
          await prisma.durableAlertJob.update({
            where: { name: alertJobName },
            data: { leaseUntil: new Date(0) },
          });
          const next = await claimAlertJob();
          assert.ok(next);
          assert.notEqual(next.token, old.token);
          await assert.rejects(
            prisma.$transaction((db) => renewAlertLease(db, old.token)),
            LostAlertLease,
          );
          await assert.rejects(finishAlertJob(old.token, null), LostAlertLease);
          await assert.rejects(
            evaluatePriceAlerts(undefined, { leaseToken: old.token }),
            LostAlertLease,
          );
          assert.equal(
            await prisma.alertDelivery.count({
              where: { userId: { in: ids } },
            }),
            0,
          );
          await finishAlertJob(next.token, null);
        },
      );
      await t.test(
        "a delivery failure rolls back alert timestamp, notification and ledger; retry persists backoff",
        async () => {
          await due();
          await prisma.socialProfile.update({
            where: { userId: ids[0] },
            data: { settings: { notifications: "invalid" } },
          });
          await assert.rejects(runDurableAlertBatch());
          assert.equal(
            (await prisma.priceAlert.findUniqueOrThrow({ where: { id: a } }))
              .lastTriggered,
            null,
          );
          assert.equal(
            await prisma.alertDelivery.count({ where: { userId: ids[0] } }),
            0,
          );
          assert.equal(
            await prisma.socialNotification.count({
              where: { userId: ids[0], kind: "price-alert" },
            }),
            0,
          );
          const state = await prisma.durableAlertJob.findUniqueOrThrow({
            where: { name: alertJobName },
          });
          assert.equal(state.failures, 1);
          assert.equal(state.leaseToken, null);
          assert.equal(state.lastErrorCode, "EVALUATION_FAILED");
          assert.ok(state.nextRunAt.getTime() > Date.now());
          await prisma.socialProfile.update({
            where: { userId: ids[0] },
            data: { settings: { notifications: true } },
          });
        },
      );
      await t.test(
        "matching notifications and ledger commit together; disabled preferences are recorded, replay deduplicates",
        async () => {
          await due();
          const result = await runDurableAlertBatch();
          assert.equal(result.claimed, true);
          const events = await prisma.alertDelivery.findMany({
            where: { userId: { in: ids } },
          });
          assert.equal(events.length, 2);
          assert.equal(
            events.find((e) => e.userId === ids[0])?.outcome,
            "delivered",
          );
          assert.equal(
            events.find((e) => e.userId === ids[1])?.outcome,
            "disabled",
          );
          assert.equal(
            await prisma.socialNotification.count({
              where: { userId: ids[0], kind: "price-alert" },
            }),
            1,
          );
          assert.equal(
            await prisma.socialNotification.count({
              where: { userId: ids[1], kind: "price-alert" },
            }),
            0,
          );
          await prisma.priceAlert.updateMany({
            where: { id: { in: [a, b] } },
            data: { lastTriggered: null },
          });
          await due();
          await runDurableAlertBatch();
          assert.equal(
            await prisma.alertDelivery.count({
              where: { userId: { in: ids } },
            }),
            2,
          );
          assert.equal(
            await prisma.socialNotification.count({
              where: { userId: ids[0], kind: "price-alert" },
            }),
            1,
          );
        },
      );
      await t.test(
        "worker failures retain checkpoint and concurrent batch runner only executes once",
        async () => {
          await due();
          let calls = 0;
          const evaluate: typeof evaluatePriceAlerts = async () => {
            calls++;
            await new Promise((r) => setTimeout(r, 30));
            return {
              inspected: 0,
              triggered: 0,
              delivered: 0,
              invalidRules: 0,
              nextCursor: "durable-checkpoint",
            };
          };
          await Promise.all([
            runDurableAlertBatch(evaluate),
            runDurableAlertBatch(evaluate),
          ]);
          assert.equal(calls, 1);
          await due();
          await assert.rejects(
            runDurableAlertBatch(async () => {
              throw new Error("private credentials must not be stored");
            }),
          );
          const state = await prisma.durableAlertJob.findUniqueOrThrow({
            where: { name: alertJobName },
          });
          assert.equal(state.cursor, "durable-checkpoint");
          assert.equal(state.lastErrorCode, "EVALUATION_FAILED");
        },
      );
      await t.test(
        "history is private, paginated across timestamp ties, survives alert deletion and cascades with account",
        async () => {
          assert.equal((await history(0, "/capabilities")).body.history, true);
          const own = await history(0);
          assert.equal(own.status, 200);
          assert.equal(own.body.data.length, 1);
          assert.equal(own.body.data[0].alertId, a);
          assert.equal((await history(1)).body.data[0].alertId, b);
          const original = own.body.data[0];
          const time = new Date("2026-01-01T12:00:00.000Z");
          const records = Array.from({ length: 3 }, (_, i) => ({
            userId: ids[0],
            alertId: a,
            observationId: "fixture-" + i,
            slug,
            title: "Fixture",
            amount: 80,
            currency: "ZAR",
            mode: "target",
            outcome: "delivered",
            observedAt: time,
            createdAt: time,
          }));
          await prisma.alertDelivery.createMany({ data: records });
          let cursor = "",
            seen: string[] = [];
          do {
            const page = await history(
              0,
              "/deliveries?limit=2" +
                (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
            );
            assert.equal(page.status, 200);
            seen.push(...page.body.data.map((r: any) => r.id));
            cursor = page.body.nextCursor ?? "";
          } while (cursor);
          assert.equal(seen.length, 4);
          assert.equal(new Set(seen).size, 4);
          assert.ok(seen.includes(original.id));
          assert.equal(
            (await history(0, "/deliveries?cursor=bad")).status,
            400,
          );
          assert.equal((await history(0, "/deliveries?limit=51")).status, 400);
          assert.equal(
            (await history(0, "/deliveries?userId=" + ids[1])).status,
            400,
          );
          await prisma.priceAlert.delete({ where: { id: a } });
          assert.equal((await history(0)).body.data.length, 4);
          await prisma.user.delete({ where: { id: ids[1] } });
          assert.equal(
            await prisma.alertDelivery.count({ where: { userId: ids[1] } }),
            0,
          );
        },
      );
    } finally {
      await new Promise<void>((r) => s.close(() => r()));
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.game.deleteMany({ where: { slug } });
      await prisma.durableAlertJob.deleteMany({
        where: { name: alertJobName },
      });
      await prisma.$disconnect();
    }
  },
);
