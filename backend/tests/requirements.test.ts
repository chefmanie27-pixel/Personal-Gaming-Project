import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requirementText,
  steamRequirements,
  gogRequirements,
  microsoftRequirements,
  rawgRequirements,
} from "../src/integrations/requirements.js";
import { steamGame } from "../src/integrations/steam.js";
import { publicGame } from "../src/integrations/publicStores.js";

test("requirements keep readable lines and entities while removing executable markup", () => {
  const result = requirementText(
    "<strong>Minimum:</strong><br><ul><li><strong>OS:</strong> Windows 11</li><li>Memory: 8&nbsp;GB RAM</li><li>Graphics: A &amp; B &#43; C</li></ul><script>alert(1)</script><style>body{display:none}</style>",
  );
  assert.equal(result, "OS: Windows 11\nMemory: 8 GB RAM\nGraphics: A & B + C");
  assert.equal(requirementText("<strong>Minimum:</strong><br><ul></ul>"), null);
  for (const value of [null, undefined, [], {}, "", 42, "Not specified"])
    assert.equal(requirementText(value), null);
});

test("Steam keeps operating systems separate and does not invent missing recommended specs", () => {
  const result = steamRequirements({
    pc_requirements: { minimum: "<strong>Minimum:</strong><br>CPU: Test CPU" },
    mac_requirements: { recommended: "OS: macOS" },
    linux_requirements: { minimum: "<strong>Minimum:</strong><br><ul></ul>" },
  });
  assert.deepEqual(result, [
    { platform: "Windows", minimum: "CPU: Test CPU", recommended: null },
    { platform: "macOS", minimum: null, recommended: "OS: macOS" },
  ]);
  assert.deepEqual(
    steamRequirements({ pc_requirements: [], mac_requirements: null }),
    [],
  );
});

test("GOG requirements map their own OS and recommendation tiers without mixing them", () => {
  const result = gogRequirements({
    _embedded: {
      supportedOperatingSystems: [
        {
          operatingSystem: { name: "windows" },
          systemRequirements: [
            {
              type: "minimum",
              requirements: [
                { name: "Memory:", description: "8 GB" },
                { name: "Graphics:", description: "<b>Test GPU</b>" },
              ],
            },
            {
              type: "recommended",
              requirements: [{ name: "Memory:", description: "16 GB" }],
            },
          ],
        },
        {
          operatingSystem: { name: "osx" },
          systemRequirements: [
            {
              type: "minimum",
              requirements: [{ name: "OS:", description: "macOS 14" }],
            },
          ],
        },
      ],
    },
  });
  assert.equal(result[0].minimum, "Memory: 8 GB\nGraphics: Test GPU");
  assert.equal(result[0].recommended, "Memory: 16 GB");
  assert.equal(result[1].platform, "macOS");
  assert.equal(result[1].recommended, null);
  assert.deepEqual(
    gogRequirements({ _embedded: { supportedOperatingSystems: [] } }),
    [],
  );
});

test("Microsoft platform availability alone is not treated as hardware requirements", () => {
  const available = {
    ItemCode: "dvc",
    Name: "Available on",
    Description: "PC, Xbox console",
  };
  assert.deepEqual(
    microsoftRequirements({
      Payload: {
        SystemRequirements: {
          Minimum: { Items: [available] },
          Recommended: { Items: [available] },
        },
      },
    }),
    [],
  );
  const result = microsoftRequirements({
    Payload: {
      SystemRequirements: {
        Minimum: {
          Items: [
            available,
            { Name: "Processor", Description: "CPU A" },
            { Name: "Memory", Description: "8 GB" },
          ],
        },
        Recommended: { Items: [{ Name: "Memory", Description: "16 GB" }] },
      },
    },
  });
  assert.deepEqual(result, [
    {
      platform: "Windows",
      minimum: "Processor: CPU A\nMemory: 8 GB",
      recommended: "Memory: 16 GB",
    },
  ]);
});

test("RAWG only exposes desktop requirements, not console metadata", () => {
  const result = rawgRequirements({
    platforms: [
      {
        platform: { name: "PC" },
        requirements_en: { minimum: "Memory: 8 GB" },
      },
      {
        platform: { name: "PlayStation 5" },
        requirements_en: { minimum: "Console data" },
      },
      {
        platform: { name: "Linux" },
        requirements_en: { recommended: "OS: Linux" },
      },
    ],
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].platform, "PC");
  assert.equal(result[1].platform, "Linux");
  assert.equal(result[0].recommended, null);
});

test("Steam details include the storefront PC requirements", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        "501001": {
          success: true,
          data: {
            type: "game",
            name: "Spec fixture",
            is_free: false,
            header_image: "https://example.com/cover.jpg",
            pc_requirements: {
              minimum: "<strong>Minimum:</strong><br>Memory: 8 GB",
              recommended: "Memory: 16 GB",
            },
          },
        },
      }),
    );
  try {
    const game = await steamGame("steam-501001", false);
    assert.equal(game?.systemRequirements?.[0].minimum, "Memory: 8 GB");
    assert.equal(game?.systemRequirements?.[0].recommended, "Memory: 16 GB");
  } finally {
    globalThis.fetch = original;
  }
});

test("GOG and Xbox PC details load their native requirements independently of price or cover data", async () => {
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("api.gog.com/v2/games"))
      return new Response(
        JSON.stringify({
          _embedded: {
            supportedOperatingSystems: [
              {
                operatingSystem: { name: "windows" },
                systemRequirements: [
                  {
                    type: "minimum",
                    requirements: [
                      { name: "Processor:", description: "GOG CPU" },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      );
    if (url.includes("/prices"))
      return new Response(JSON.stringify({ _embedded: { prices: [] } }));
    if (url.includes("api.gog.com/products"))
      return new Response(
        JSON.stringify({
          id: 501002,
          title: "GOG fixture",
          slug: "spec-fixture",
          links: { product_card: "https://www.gog.com/game/spec-fixture" },
          description: { lead: "Description" },
        }),
      );
    if (url.includes("storeedgefd.dsx.mp.microsoft.com"))
      return new Response(
        JSON.stringify({
          Payload: {
            SystemRequirements: {
              Minimum: {
                Items: [{ Name: "Processor", Description: "Xbox PC CPU" }],
              },
              Recommended: {
                Items: [{ Name: "Memory", Description: "16 GB" }],
              },
            },
          },
        }),
      );
    return new Response(
      JSON.stringify({
        Products: [
          {
            ProductId: "9SPECSPECSPE",
            LocalizedProperties: [
              {
                ProductTitle: "PC fixture",
                ProductDescription: "Description",
                Images: [],
              },
            ],
          },
        ],
      }),
    );
  };
  try {
    const gog = await publicGame("gog-501002");
    assert.equal(gog?.systemRequirements?.[0].minimum, "Processor: GOG CPU");
    const pc = await publicGame("xboxpc-9SPECSPECSPE");
    assert.equal(pc?.systemRequirements?.[0].minimum, "Processor: Xbox PC CPU");
    assert.equal(pc?.systemRequirements?.[0].recommended, "Memory: 16 GB");
    const console = await publicGame("xbox-9SPECSPECSPE");
    assert.equal(console?.systemRequirements, undefined);
    assert.equal(
      requested.filter((url) =>
        url.includes("storeedgefd.dsx.mp.microsoft.com"),
      ).length,
      1,
    );
  } finally {
    globalThis.fetch = original;
  }
});
