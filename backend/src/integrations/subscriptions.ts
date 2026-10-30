export interface SubscriptionPrice {
  months: number;
  amount: number | null;
  currency: "ZAR";
  status: "live" | "reference" | "unavailable";
  checkedAt: string | null;
  sourceUrl: string;
}
export interface SubscriptionPlan {
  id: string;
  name: string;
  provider: string;
  platforms: string[];
  note: string;
  prices: SubscriptionPrice[];
}
interface LivePlan {
  id: string;
  name: string;
  expectedTitle: string;
  provider: string;
  platforms: string[];
  productId: string;
  note: string;
}
const livePlans: LivePlan[] = [
  {
    id: "gamepass-pc",
    name: "PC Game Pass",
    expectedTitle: "PC Game Pass",
    provider: "Xbox Game Pass",
    platforms: ["PC"],
    productId: "CFQ7TTC0KGQ8",
    note: "PC library with EA Play included. Regular recurring price; trial offers are excluded.",
  },
  {
    id: "gamepass-essential",
    name: "Game Pass Essential",
    expectedTitle: "Game Pass Essential",
    provider: "Xbox Game Pass",
    platforms: ["PC", "Xbox"],
    productId: "CFQ7TTC0K5DJ",
    note: "Selected PC and Xbox games with online console multiplayer. Check the included library.",
  },
  {
    id: "gamepass-premium",
    name: "Game Pass Premium",
    expectedTitle: "Game Pass Premium",
    provider: "Xbox Game Pass",
    platforms: ["PC", "Xbox"],
    productId: "CFQ7TTC0P85B",
    note: "PC and Xbox libraries with online console multiplayer. Check the included games and release timing.",
  },
  {
    id: "gamepass-ultimate",
    name: "Game Pass Ultimate",
    expectedTitle: "Game Pass Ultimate",
    provider: "Xbox Game Pass",
    platforms: ["PC", "Xbox"],
    productId: "CFQ7TTC0KHS0",
    note: "PC and Xbox libraries with EA Play and other included memberships. Check regional benefits.",
  },
  {
    id: "ea-play-xbox",
    name: "EA Play (Xbox)",
    expectedTitle: "EA Play",
    provider: "EA Play",
    platforms: ["Xbox"],
    productId: "CFQ7TTC0K5DH",
    note: "Xbox membership. A standalone membership does not automatically transfer to other storefronts.",
  },
  {
    id: "ubisoft-premium",
    name: "Ubisoft+ Premium",
    expectedTitle: "Ubisoft+ Premium",
    provider: "Ubisoft+",
    platforms: ["PC", "Xbox"],
    productId: "CFQ7TTC0QH5H",
    note: "Xbox purchase with linked Ubisoft account access. Verify your PC/Xbox entitlements on the provider.",
  },
];
function plainText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, v: string) =>
      String.fromCodePoint(parseInt(v, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, v: string) => String.fromCodePoint(Number(v)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
export function parseXboxMonthlyPrice(
  html: string,
  expectedTitle: string,
): number | null {
  const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (
    !heading ||
    !plainText(heading[1]).toLowerCase().includes(expectedTitle.toLowerCase())
  )
    return null;
  const section = plainText(
    html.slice(heading.index + heading[0].length),
  ).split(/Choose the plan/i)[0];
  const pattern = /R\s*([0-9]+(?:[.\s][0-9]{3})*),([0-9]{2})\s*\/month\b/gi;
  const values = [...section.matchAll(pattern)].map((m) => ({
    amount: Number(m[1].replace(/[.\s]/g, "")) + Number(m[2]) / 100,
    after: section
      .slice(m.index! + m[0].length)
      .trimStart()
      .startsWith("after that"),
  }));
  const renewal = values.find((v) => v.after);
  const unique = [...new Set(values.map((v) => v.amount))];
  const amount = renewal?.amount ?? (unique.length === 1 ? unique[0] : null);
  return amount !== null && Number.isFinite(amount) && amount > 0
    ? amount
    : null;
}
const referenceDate = "2026-10-30";
const psSource = "https://www.playstation.com/en-za/ps-plus/whats-new/";
function references(): SubscriptionPlan[] {
  const plans: SubscriptionPlan[] = [
    ...[
      {
        id: "ps-essential",
        name: "PlayStation Plus Essential",
        amounts: [149, 409, 1109],
      },
      {
        id: "ps-extra",
        name: "PlayStation Plus Extra",
        amounts: [229, 649, 1869],
      },
      {
        id: "ps-deluxe",
        name: "PlayStation Plus Deluxe",
        amounts: [279, 769, 2199],
      },
    ].map((p) => ({
      id: p.id,
      name: p.name,
      provider: "PlayStation Plus",
      platforms: ["PlayStation"],
      note: "South African reference prices checked on 30 October 2026. This is not a live checkout quote.",
      prices: p.amounts.map((amount, i) => ({
        months: [1, 3, 12][i],
        amount,
        currency: "ZAR" as const,
        status: "reference" as const,
        checkedAt: referenceDate,
        sourceUrl: psSource,
      })),
    })),
    ...[
      { id: "nso-individual", name: "Nintendo Switch Online - Individual" },
      { id: "nso-family", name: "Nintendo Switch Online - Family" },
      {
        id: "nso-expansion-individual",
        name: "Nintendo Switch Online + Expansion Pack - Individual",
      },
      {
        id: "nso-expansion-family",
        name: "Nintendo Switch Online + Expansion Pack - Family",
      },
    ].map((p) => ({
      ...p,
      provider: "Nintendo Switch Online",
      platforms: ["Nintendo"],
      note: "South African price could not be confirmed from the public source. Check Nintendo eShop on your console.",
      prices: [
        {
          months: 12,
          amount: null,
          currency: "ZAR" as const,
          status: "unavailable" as const,
          checkedAt: null,
          sourceUrl: "https://www.nintendo.co.za/pages/faq",
        },
      ],
    })),
    {
      id: "ea-play-pc",
      name: "EA Play (PC)",
      provider: "EA Play",
      platforms: ["PC"],
      note: "Choose your PC storefront to confirm its price. PC Game Pass already includes EA Play. Xbox and PC memberships are listed separately.",
      prices: [
        {
          months: 1,
          amount: null,
          currency: "ZAR",
          status: "unavailable",
          checkedAt: null,
          sourceUrl: "https://www.ea.com/ea-play",
        },
      ],
    },
  ];
  return plans;
}
let cache:
  | { expires: number; value: Awaited<ReturnType<typeof loadSubscriptions>> }
  | undefined;
let pending: Promise<Awaited<ReturnType<typeof loadSubscriptions>>> | undefined;
async function loadSubscriptions() {
  const data = await Promise.all(
    livePlans.map(async (plan) => {
      const sourceUrl =
        "https://www.xbox.com/en-ZA/games/store/-/" + plan.productId;
      let amount: number | null = null;
      try {
        const response = await fetch(sourceUrl, {
          signal: AbortSignal.timeout(12000),
        });
        if (
          response.ok &&
          new URL(response.url || sourceUrl).hostname === "www.xbox.com"
        )
          amount = parseXboxMonthlyPrice(
            await response.text(),
            plan.expectedTitle,
          );
      } catch {
        /* A failed request does not become a zero-price subscription. */
      }
      return {
        id: plan.id,
        name: plan.name,
        provider: plan.provider,
        platforms: plan.platforms,
        note: plan.note,
        prices: [
          {
            months: 1,
            amount,
            currency: "ZAR" as const,
            status:
              amount === null ? ("unavailable" as const) : ("live" as const),
            checkedAt: amount === null ? null : new Date().toISOString(),
            sourceUrl,
          },
        ],
      };
    }),
  );
  return {
    data: [...data, ...references()],
    meta: {
      region: "ZA",
      currency: "ZAR",
      fetchedAt: new Date().toISOString(),
      note: "Regular plan prices. Trials and introductory offers excluded. Reference prices retain their verification date; confirm the final price and renewal terms with the provider.",
    },
  };
}
export async function getSubscriptions() {
  if (cache && cache.expires > Date.now()) return cache.value;
  if (pending) return pending;
  pending = loadSubscriptions();
  try {
    const value = await pending;
    cache = { expires: Date.now() + 900000, value };
    return value;
  } finally {
    pending = undefined;
  }
}
