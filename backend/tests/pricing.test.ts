import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifiedObservation,
  reconcileObservation,
  priceSource,
} from "../src/observations.js";
import {
  priceAlertRuleSchema,
  qualifiesAlert,
  type ObservedQuote,
} from "../src/priceRules.js";
import { disabledTransport } from "../src/notifications.js";
import type { SteamGame } from "../src/integrations/steam.js";
const now = new Date("2026-11-03T12:00:00.000Z");
const game = (slug = "steam-123", amount: number | null = 80, time = now) =>
  ({
    id: slug,
    slug,
    title: "Price fixture",
    description: "Provider description",
    cover: "https://example.invalid/cover.jpg",
    hero: "https://example.invalid/hero.jpg",
    tagline: "Fixture",
    developer: "Fixture",
    publisher: "Fixture",
    score: null,
    genres: [],
    platforms: ["PC"],
    releaseDate: "",
    reviewCount: "",
    price: amount,
    store: "Steam",
    storeUrl: "https://store.steampowered.com/app/" + slug.slice(6),
    featured: false,
    status: "released",
    sourceType: "steam",
    observedAt: time.toISOString(),
  }) as SteamGame;
test("observations require exact supported provider identity and retain missing/stale quotes as unavailable", () => {
  assert.equal(priceSource("constructor-anything"), null);
  assert.equal(priceSource("rawg-1"), null);
  assert.equal(verifiedObservation(game(), "steam-123", now).usable, true);
  assert.throws(() => verifiedObservation(game(), "gog-123", now), /identity/);
  assert.equal(
    verifiedObservation(game("steam-123", null), "steam-123", now).usable,
    false,
  );
  assert.equal(
    verifiedObservation(
      game("steam-123", 80, new Date(now.getTime() - 31 * 60000)),
      "steam-123",
      now,
    ).usable,
    false,
  );
});
test("alert rules validate fresh ZA quotes, drops, recorded lows, cooldowns and unchanged-observation suppression", () => {
  const quote = (amount: number, age = 0): ObservedQuote => ({
      id: "q" + amount,
      amount,
      region: "ZA",
      currency: "ZAR",
      sourceType: "steam",
      observedAt: new Date(now.getTime() - age),
    }),
    rule = priceAlertRuleSchema.parse({ cooldownHours: 1 });
  assert.ok(qualifiesAlert(quote(80), quote(100), 85, null, rule, now));
  for (const q of [
    quote(80, 49 * 3600000),
    { ...quote(80), region: "GB" },
    { ...quote(80), currency: "USD" },
    { ...quote(80), sourceType: "mock" },
    quote(NaN),
  ])
    assert.equal(qualifiesAlert(q, quote(100), 85, null, rule, now), false);
  assert.equal(
    qualifiesAlert(
      quote(80),
      quote(100),
      85,
      new Date(now.getTime() - 1000),
      rule,
      now,
    ),
    false,
  );
  assert.equal(
    qualifiesAlert(
      quote(80),
      quote(80),
      85,
      new Date(now.getTime() - 2 * 3600000),
      rule,
      now,
    ),
    false,
  );
  assert.ok(
    qualifiesAlert(
      quote(80),
      quote(100),
      1,
      null,
      { ...rule, mode: "percentage", percent: 20 },
      now,
    ),
  );
  assert.equal(
    qualifiesAlert(
      quote(81),
      quote(100),
      1000,
      null,
      { ...rule, mode: "percentage", percent: 20 },
      now,
    ),
    false,
  );
  assert.ok(
    qualifiesAlert(
      quote(79),
      quote(100),
      1,
      null,
      { ...rule, mode: "historical-low" },
      now,
      80,
    ),
  );
  assert.equal(
    qualifiesAlert(
      quote(80),
      quote(100),
      1000,
      null,
      { ...rule, mode: "historical-low" },
      now,
      80,
    ),
    false,
  );
  assert.equal(
    qualifiesAlert(
      quote(80),
      undefined,
      1000,
      null,
      { ...rule, mode: "historical-low" },
      now,
      null,
    ),
    false,
  );
});
test("external notification transports stay disabled without sending anything", async () => {
  for (const channel of ["email", "push"] as const) {
    const t = disabledTransport(channel);
    assert.equal(t.enabled, false);
    assert.equal(
      await t.deliver({
        userId: "fixture",
        dedupe: "one",
        kind: "price-alert",
        message: "Test",
      }),
      "disabled",
    );
  }
});
test(
  "MySQL exact reconciliation deduplicates cached observations and alerts honor preferences",
  { skip: process.env.GAMEVAULT_DATABASE_TESTS !== "1" },
  async () => {
    const { prisma } = await import("../src/db.js"),
      { evaluatePriceAlerts } = await import("../src/jobs/priceAlerts.js"),
      { settingsSchema } = await import("../src/social.js"),
      { workspaceSchema } = await import("../src/workspace.js"),
      { randomUUID, randomInt } = await import("node:crypto");
    const users: string[] = [],
      slug = "steam-" + randomInt(1000000000, 1900000000);
    try {
      for (let i = 0; i < 2; i++)
        users.push(
          (
            await prisma.user.create({
              data: {
                email: "pricing-test-" + randomUUID() + "@example.invalid",
                passwordHash: "disabled",
              },
            })
          ).id,
        );
      await prisma.socialProfile.create({
        data: {
          userId: users[0],
          username: "p" + randomUUID().replaceAll("-", "").slice(0, 20),
          name: "Price tester",
          bio: "",
          avatar: "",
          banner: "",
          settings: settingsSchema.parse({}),
        },
      });
      const first = game(slug, 100, new Date(Date.now() - 20 * 60000));
      const r = await reconcileObservation(first, slug);
      assert.ok(r.recorded);
      assert.equal((await reconcileObservation(first, slug)).recorded, false);
      assert.equal(
        await prisma.regionalPrice.count({ where: { listingId: r.listingId } }),
        1,
      );
      const latest = game(slug, 80, new Date(Date.now() - 5 * 60000));
      await Promise.all([
        reconcileObservation(latest, slug),
        reconcileObservation(latest, slug),
      ]);
      assert.equal(
        await prisma.regionalPrice.count({ where: { listingId: r.listingId } }),
        2,
      );
      const alert = await prisma.priceAlert.create({
        data: { userId: users[0], listingId: r.listingId, target: 85 },
      });
      await prisma.userWorkspace.create({
        data: {
          userId: users[0],
          journalMigrated: true,
          data: workspaceSchema.parse({
            preferences: {
              genres: [],
              platforms: [],
              priceAlertRules: {
                [alert.id]: {
                  mode: "percentage",
                  percent: 20,
                  cooldownHours: 1,
                },
              },
            },
          }),
        },
      });
      await evaluatePriceAlerts();
      assert.equal(
        await prisma.socialNotification.count({
          where: { userId: users[0], kind: "price-alert" },
        }),
        1,
      );
      await evaluatePriceAlerts();
      assert.equal(
        await prisma.socialNotification.count({
          where: { userId: users[0], kind: "price-alert" },
        }),
        1,
      );
      assert.equal(
        await prisma.socialNotification.count({ where: { userId: users[1] } }),
        0,
      );
      await prisma.priceAlert.update({
        where: { id: alert.id },
        data: { lastTriggered: new Date(Date.now() - 25 * 3600000) },
      });
      await reconcileObservation(game(slug, 80, new Date()), slug);
      await evaluatePriceAlerts();
      assert.equal(
        await prisma.socialNotification.count({
          where: { userId: users[0], kind: "price-alert" },
        }),
        1,
      );
      await prisma.socialProfile.update({
        where: { userId: users[0] },
        data: { settings: settingsSchema.parse({ notifications: false }) },
      });
      await reconcileObservation(game(slug, 60, new Date()), slug);
      await evaluatePriceAlerts();
      assert.equal(
        await prisma.socialNotification.count({
          where: { userId: users[0], kind: "price-alert" },
        }),
        1,
      );
      assert.ok(
        (await prisma.priceAlert.findUniqueOrThrow({ where: { id: alert.id } }))
          .lastTriggered,
      );
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.game.deleteMany({ where: { slug } });
      await prisma.$disconnect();
    }
  },
);
