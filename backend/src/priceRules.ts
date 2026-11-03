import { z } from "zod";
export const priceAlertRuleSchema = z
  .object({
    mode: z.enum(["target", "percentage", "historical-low"]).default("target"),
    percent: z.number().min(1).max(100).default(20),
    cooldownHours: z.number().int().min(1).max(720).default(24),
  })
  .strict();
export const priceAlertRulesSchema = z
  .record(z.string().min(1).max(191), priceAlertRuleSchema)
  .refine((v) => Object.keys(v).length <= 1000);
export type AlertRule = z.infer<typeof priceAlertRuleSchema>;
export interface ObservedQuote {
  id: string;
  amount: number;
  currency: string;
  region: string;
  sourceType: string;
  observedAt: Date;
}
export function qualifiesAlert(
  latest: ObservedQuote | undefined,
  previous: ObservedQuote | undefined,
  target: number,
  lastTriggered: Date | null,
  rule: AlertRule,
  now: Date,
  priorLow: number | null = null,
) {
  if (
    !latest ||
    latest.region !== "ZA" ||
    latest.currency !== "ZAR" ||
    ["mock", "seed", "development"].includes(latest.sourceType.toLowerCase()) ||
    !Number.isFinite(latest.amount) ||
    latest.amount < 0
  )
    return false;
  const age = now.getTime() - latest.observedAt.getTime();
  if (!Number.isFinite(age) || age < -60000 || age > 48 * 3600000) return false;
  if (
    lastTriggered &&
    (latest.observedAt <= lastTriggered ||
      now.getTime() - lastTriggered.getTime() < rule.cooldownHours * 3600000 ||
      previous?.amount === latest.amount)
  )
    return false;
  if (rule.mode === "percentage")
    return (
      !!previous &&
      previous.amount > 0 &&
      ((previous.amount - latest.amount) / previous.amount) * 100 >=
        rule.percent
    );
  if (rule.mode === "historical-low")
    return (
      priorLow !== null && Number.isFinite(priorLow) && latest.amount < priorLow
    );
  return Number.isFinite(target) && latest.amount <= target;
}
