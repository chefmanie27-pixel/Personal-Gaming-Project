import { config } from "../config.js";
import { renewAlertLease } from "./alertLease.js";
import { prisma } from "../db.js";
import {
  priceAlertRulesSchema,
  priceAlertRuleSchema,
  qualifiesAlert,
  type ObservedQuote,
} from "../priceRules.js";
import { deliverInApp } from "../notifications.js";
export async function evaluatePriceAlerts(
  afterId?: string,
  options: { leaseToken?: string } = {},
) {
  if (config.DURABLE_ALERTS_ENABLED && !options.leaseToken)
    throw new Error(
      "Use the durable alert worker while durable mode is enabled.",
    );
  const now = new Date();
  const alerts = await prisma.priceAlert.findMany({
    where: { active: true, ...(afterId ? { id: { gt: afterId } } : {}) },
    orderBy: { id: "asc" },
    take: 100,
    include: {
      user: {
        select: { workspace: { select: { data: true, version: true } } },
      },
      listing: {
        include: {
          game: { select: { title: true, slug: true } },
          prices: {
            where: {
              region: "ZA",
              currency: "ZAR",
              amount: { gte: 0 },
              sourceType: { notIn: ["mock", "seed", "development"] },
              observedAt: { lte: now },
            },
            orderBy: [{ observedAt: "desc" }, { id: "desc" }],
            take: 2,
          },
        },
      },
    },
  });
  let triggered = 0,
    delivered = 0,
    invalidRules = 0;
  for (const alert of alerts) {
    if (alert.currency !== "ZAR") continue;
    const preferences = (
      alert.user.workspace?.data as
        { preferences?: { priceAlertRules?: unknown } } | undefined
    )?.preferences;
    const parsed = priceAlertRulesSchema.safeParse(
      preferences?.priceAlertRules ?? {},
    );
    if (!parsed.success) {
      invalidRules++;
      continue;
    }
    const rule = parsed.data[alert.id] ?? priceAlertRuleSchema.parse({});
    const quote = (
      p: (typeof alert.listing.prices)[number],
    ): ObservedQuote => ({ ...p, amount: Number(p.amount) });
    const latest = alert.listing.prices[0]
        ? quote(alert.listing.prices[0])
        : undefined,
      previous = alert.listing.prices[1]
        ? quote(alert.listing.prices[1])
        : undefined;
    let priorLow: number | null = null;
    if (rule.mode === "historical-low" && latest) {
      const aggregate = await prisma.regionalPrice.aggregate({
        where: {
          listingId: alert.listingId,
          region: "ZA",
          currency: "ZAR",
          amount: { gte: 0 },
          sourceType: { notIn: ["mock", "seed", "development"] },
          observedAt: { lt: latest.observedAt },
        },
        _min: { amount: true },
      });
      priorLow =
        aggregate._min.amount === null ? null : Number(aggregate._min.amount);
    }
    if (
      !qualifiesAlert(
        latest,
        previous,
        Number(alert.target),
        alert.lastTriggered,
        rule,
        now,
        priorLow,
      )
    )
      continue;
    const result = await prisma.$transaction(
      async (db) => {
        const checkedAt = options.leaseToken
          ? await renewAlertLease(db, options.leaseToken)
          : now;
        if (
          options.leaseToken &&
          (await db.alertDelivery.findUnique({
            where: {
              userId_alertId_observationId: {
                userId: alert.userId,
                alertId: alert.id,
                observationId: latest!.id,
              },
            },
          }))
        )
          return null;
        const workspace = await db.userWorkspace.findUnique({
          where: { userId: alert.userId },
          select: { version: true },
        });
        if (
          workspace?.version !== alert.user.workspace?.version ||
          !qualifiesAlert(
            latest,
            previous,
            Number(alert.target),
            alert.lastTriggered,
            rule,
            checkedAt,
            priorLow,
          )
        )
          return null;
        const claimed = await db.priceAlert.updateMany({
          where: {
            id: alert.id,
            userId: alert.userId,
            active: true,
            lastTriggered: alert.lastTriggered,
            target: alert.target,
            currency: alert.currency,
          },
          data: { lastTriggered: checkedAt },
        });
        if (!claimed.count) return null;
        const outcome = await deliverInApp(db, {
          userId: alert.userId,
          dedupe: "price:" + alert.id + ":" + latest!.id,
          kind: "price-alert",
          entityId: alert.id,
          message: (
            alert.listing.game.title.slice(0, 300) +
            " / ZA quote R" +
            latest!.amount.toFixed(2) +
            " matched your " +
            rule.mode +
            " rule. Observed " +
            latest!.observedAt.toISOString() +
            ". Verify the current checkout price."
          ).slice(0, 500),
        });
        if (options.leaseToken)
          await db.alertDelivery.create({
            data: {
              userId: alert.userId,
              alertId: alert.id,
              observationId: latest!.id,
              slug: alert.listing.game.slug,
              title: alert.listing.game.title.slice(0, 500),
              amount: latest!.amount,
              currency: latest!.currency,
              mode: rule.mode,
              outcome,
              observedAt: latest!.observedAt,
            },
          });
        return outcome;
      },
      { isolationLevel: "ReadCommitted", timeout: 15000 },
    );
    if (result !== null) {
      triggered++;
      if (result === "delivered") delivered++;
    }
  }
  return {
    inspected: alerts.length,
    triggered,
    delivered,
    invalidRules,
    nextCursor: alerts.length === 100 ? alerts.at(-1)!.id : null,
  };
}
