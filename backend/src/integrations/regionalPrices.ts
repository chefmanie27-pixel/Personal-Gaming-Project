import { z } from "zod";
export interface RegionalPrice {
  price: number | null;
  originalPrice?: number;
}
const unknownPrice: RegionalPrice = { price: null };
function active(
  start: string | undefined,
  end: string | undefined,
  now: number,
) {
  const begin = start ? Date.parse(start) : -Infinity,
    finish = end ? Date.parse(end) : Infinity;
  return (
    !Number.isNaN(begin) &&
    !Number.isNaN(finish) &&
    begin <= now &&
    now < finish
  );
}
const sku = z.object({
  Sku: z.object({
    SkuType: z.string(),
    SubscriptionPolicyId: z.unknown().optional(),
    RecurrencePolicy: z.unknown().optional(),
    Properties: z.object({ IsTrial: z.boolean().optional() }).optional(),
  }),
  Availabilities: z
    .array(
      z.object({
        Actions: z.array(z.string()).optional(),
        Markets: z.array(z.string()).optional(),
        RemediationRequired: z.boolean().optional(),
        Remediations: z.array(z.unknown()).optional(),
        Conditions: z
          .object({
            StartDate: z.string().optional(),
            EndDate: z.string().optional(),
            ClientConditions: z
              .object({
                AllowedPlatforms: z
                  .array(z.object({ PlatformName: z.string() }))
                  .optional(),
              })
              .optional(),
          })
          .optional(),
        OrderManagementData: z
          .object({
            Price: z.object({
              CurrencyCode: z.string(),
              ListPrice: z.number().finite().nonnegative(),
              MSRP: z.number().finite().nonnegative().optional(),
            }),
          })
          .optional(),
      }),
    )
    .optional(),
});
export function microsoftPrice(
  value: unknown,
  platform: "Windows.Desktop" | "Windows.Xbox",
  now = Date.now(),
): RegionalPrice {
  if (!Array.isArray(value)) return unknownPrice;
  const candidates: RegionalPrice[] = [];
  for (const raw of value) {
    const parsed = sku.safeParse(raw);
    if (!parsed.success) continue;
    const s = parsed.data;
    if (
      s.Sku.SkuType !== "full" ||
      s.Sku.Properties?.IsTrial ||
      s.Sku.SubscriptionPolicyId ||
      s.Sku.RecurrencePolicy
    )
      continue;
    for (const a of s.Availabilities ?? []) {
      const p = a.OrderManagementData?.Price;
      if (
        !p ||
        p.CurrencyCode !== "ZAR" ||
        !a.Actions?.includes("Purchase") ||
        !a.Markets?.includes("ZA") ||
        a.RemediationRequired ||
        a.Remediations?.length ||
        !a.Conditions?.ClientConditions?.AllowedPlatforms?.some(
          (v) => v.PlatformName === platform,
        ) ||
        !active(a.Conditions?.StartDate, a.Conditions?.EndDate, now)
      )
        continue;
      candidates.push({
        price: p.ListPrice,
        originalPrice:
          p.MSRP !== undefined && p.MSRP > p.ListPrice ? p.MSRP : undefined,
      });
    }
  }
  return candidates.sort((a, b) => a.price! - b.price!)[0] ?? unknownPrice;
}
const nintendoMoney = z.object({
  raw_value: z.string().regex(/^\d+(?:\.\d+)?$/),
  currency: z.string(),
  start_datetime: z.string().optional(),
  end_datetime: z.string().optional(),
});
export function nintendoPrices(
  value: unknown,
  now = Date.now(),
): Map<string, RegionalPrice> {
  const result = new Map<string, RegionalPrice>();
  const envelope = z
    .object({
      country: z.literal("ZA"),
      personalized: z.literal(false),
      prices: z.array(z.unknown()),
    })
    .safeParse(value);
  if (!envelope.success) return result;
  for (const raw of envelope.data.prices) {
    const p = z
      .object({
        title_id: z.union([z.number().int().safe(), z.string().regex(/^\d+$/)]),
        sales_status: z.string(),
        regular_price: nintendoMoney.optional(),
        discount_price: nintendoMoney.optional(),
      })
      .safeParse(raw);
    if (!p.success) continue;
    const row = p.data;
    if (!["onsale", "pre_order"].includes(row.sales_status)) continue;
    const regular =
      row.regular_price?.currency === "ZAR"
        ? Number(row.regular_price.raw_value)
        : null;
    if (regular === null || !Number.isFinite(regular)) continue;
    const discount = row.discount_price;
    const current =
      discount?.currency === "ZAR" &&
      active(discount.start_datetime, discount.end_datetime, now) &&
      Number(discount.raw_value) <= regular
        ? Number(discount.raw_value)
        : regular;
    result.set(String(row.title_id), {
      price: current,
      originalPrice: current < regular ? regular : undefined,
    });
  }
  return result;
}
