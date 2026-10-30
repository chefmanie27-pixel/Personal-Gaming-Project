import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseXboxMonthlyPrice,
  getSubscriptions,
} from "../src/integrations/subscriptions.js";

test("subscription prices use the recurring amount rather than a trial or another plan", () => {
  const html =
    "<h1>PC Game Pass - 14 Day Trial Recurs Monthly</h1><div>R209,00/month</div><div>R19,00 for 14 days</div><div>R209,00/month after that</div><h2>Choose the plan that is right for you</h2><div>Ultimate R239,00/month</div>";
  assert.equal(parseXboxMonthlyPrice(html, "PC Game Pass"), 209);
  assert.equal(parseXboxMonthlyPrice(html, "Game Pass Ultimate"), null);
  assert.equal(
    parseXboxMonthlyPrice(
      "<h1>PC Game Pass</h1>R19,00/month R209,00/month after that",
      "PC Game Pass",
    ),
    209,
  );
  assert.equal(
    parseXboxMonthlyPrice(
      "<h1>PC Game Pass</h1>R19,00/month R209,00/month",
      "PC Game Pass",
    ),
    null,
  );
});

test("foreign currency, annual totals, missing headings, and free trial prices do not become monthly ZAR quotes", () => {
  for (const text of [
    "$19.99/month",
    "R199,00/year",
    "R0,00/month",
    "R19,00 for 14 days",
  ])
    assert.equal(
      parseXboxMonthlyPrice("<h1>PC Game Pass</h1>" + text, "PC Game Pass"),
      null,
    );
  assert.equal(parseXboxMonthlyPrice("R209,00/month", "PC Game Pass"), null);
  assert.equal(
    parseXboxMonthlyPrice(
      "<h1>PC Game Pass</h1>R1.209,95/month",
      "PC Game Pass",
    ),
    1209.95,
  );
});

test("subscription provider failures are isolated, references are dated, and concurrent loads share requests", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (input) => {
    requests++;
    const url = String(input);
    if (url.includes("CFQ7TTC0KGQ8"))
      return new Response(
        "<h1>PC Game Pass</h1>R209,00/month R19,00 for 14 days",
      );
    if (url.includes("CFQ7TTC0KHS0"))
      return new Response(
        "<h1>Game Pass Ultimate</h1>R19,00/month R239,00/month after that",
      );
    if (url.includes("CFQ7TTC0K5DH"))
      return new Response("<h1>EA Play</h1>R89,95/month");
    if (url.includes("CFQ7TTC0P85B"))
      return new Response("<h1>Game Pass Premium</h1>R199,00/month");
    if (url.includes("CFQ7TTC0K5DJ"))
      return new Response("Unavailable", { status: 503 });
    throw new Error("Provider timeout");
  };
  try {
    const [a, b] = await Promise.all([getSubscriptions(), getSubscriptions()]);
    assert.equal(requests, 6);
    assert.deepEqual(a, b);
    assert.equal(
      a.data.find((p) => p.id === "gamepass-pc")?.prices[0].amount,
      209,
    );
    assert.equal(
      a.data.find((p) => p.id === "gamepass-premium")?.prices[0].amount,
      199,
    );
    assert.equal(
      a.data.find((p) => p.id === "gamepass-essential")?.prices[0].status,
      "unavailable",
    );
    assert.equal(
      a.data.find((p) => p.id === "ubisoft-premium")?.prices[0].amount,
      null,
    );
    const ps = a.data.find((p) => p.id === "ps-essential")!;
    assert.deepEqual(
      ps.prices.map((p) => p.months),
      [1, 3, 12],
    );
    assert.ok(
      ps.prices.every(
        (p) => p.status === "reference" && p.checkedAt === "2026-10-30",
      ),
    );
    assert.ok(
      a.data
        .filter((p) => p.provider === "Nintendo Switch Online")
        .every((p) =>
          p.prices.every(
            (v) => v.amount === null && v.status === "unavailable",
          ),
        ),
    );
    assert.ok(
      a.data
        .flatMap((p) => p.prices)
        .every(
          (p) => p.currency === "ZAR" && p.sourceUrl.startsWith("https://"),
        ),
    );
    await getSubscriptions();
    assert.equal(requests, 6);
  } finally {
    globalThis.fetch = original;
  }
});
