import { z } from "zod";
import { steamRequest } from "./steam.js";
import { publicStoreRequest } from "./publicStores.js";
import { requirementText } from "./requirements.js";
export interface RelatedProduct {
  id: string;
  title: string;
  kind: "edition" | "bundle" | "package" | "dlc" | "soundtrack";
  url: string;
}
export interface RelatedResult {
  data: RelatedProduct[];
  meta: {
    page: number;
    total: number | null;
    hasMore: boolean;
    supported: boolean;
    partial: boolean;
    storeUrl: string | null;
  };
}
const htmlCache = new Map<string, { expires: number; value: string }>();
async function steamPage(id: string) {
  const cached = htmlCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.value;
  const response = await fetch(
    "https://store.steampowered.com/app/" + id + "/?cc=za&l=english",
    { signal: AbortSignal.timeout(12000) },
  );
  if (!response.ok) throw Error("Store page unavailable");
  const value = await response.text();
  if (htmlCache.size >= 20) htmlCache.delete(htmlCache.keys().next().value!);
  htmlCache.set(id, { expires: Date.now() + 300000, value });
  return value;
}
export function steamBundleIds(html: string): number[] {
  return [
    ...new Set(
      [...html.matchAll(/<div\b[^>]*\bdata-ds-bundleid="(\d+)"[^>]*>/gi)]
        .filter((m) =>
          /class="[^"]*\bgame_area_purchase_game_wrapper\b/.test(m[0]),
        )
        .map((m) => Number(m[1]))
        .filter((n) => Number.isSafeInteger(n) && n > 0),
    ),
  ];
}
function storeLink(value: unknown, hostname: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      (u.hostname === hostname || u.hostname === "www." + hostname)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function result(
  data: RelatedProduct[],
  page: number,
  total: number | null,
  hasMore: boolean,
  storeUrl: string | null,
  supported = true,
  partial = false,
): RelatedResult {
  return {
    data: [...new Map(data.map((v) => [v.id, v])).values()],
    meta: { page, total, hasMore, storeUrl, supported, partial },
  };
}
const steamMeta = z.object({
  success: z.boolean(),
  data: z
    .object({
      name: z.string(),
      dlc: z.array(z.number().int().positive()).optional(),
      package_groups: z
        .array(
          z.object({
            subs: z
              .array(
                z.object({
                  packageid: z.number().int().positive(),
                  option_text: z.string(),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
export async function gameRelated(
  slug: string,
  kind: "editions" | "dlc",
  page = 1,
  limit = 8,
): Promise<RelatedResult | null> {
  const match =
    /^(steam|gog|xboxpc|xbox|nintendo|epic|rawg)-([a-zA-Z0-9_-]{1,80})$/.exec(
      slug,
    );
  if (!match) return null;
  const [, source, id] = match;
  if (source === "steam") {
    if (!/^[1-9]\d{0,9}$/.test(id)) return null;
    const all = await steamRequest<Record<string, unknown>>(
      "/api/appdetails?appids=" + id + "&cc=za&l=english",
    );
    const metadata = steamMeta.parse(all[id]);
    if (!metadata.success || !metadata.data) return null;
    const game = metadata.data;
    if (kind === "dlc") {
      const ids = [...new Set(game.dlc ?? [])].filter((n) => String(n) !== id);
      const selected = ids.slice((page - 1) * limit, page * limit);
      const data: RelatedProduct[] = [];
      let partial = false;
      for (let i = 0; i < selected.length; i += 4) {
        const batch = await Promise.allSettled(
          selected.slice(i, i + 4).map(async (appid) => {
            const raw = await steamRequest<Record<string, unknown>>(
              "/api/appdetails?appids=" + appid + "&cc=za&l=english",
            );
            const item = z
              .object({
                success: z.boolean(),
                data: z
                  .object({
                    name: z.string(),
                    type: z.string().optional(),
                    fullgame: z
                      .object({ appid: z.coerce.number().int().positive() })
                      .optional(),
                  })
                  .optional(),
              })
              .parse(raw[String(appid)]);
            if (
              !item.success ||
              !item.data ||
              (item.data.fullgame && String(item.data.fullgame.appid) !== id)
            )
              return null;
            return {
              id: "steam-app-" + appid,
              title: item.data.name,
              kind:
                item.data.type === "music"
                  ? ("soundtrack" as const)
                  : ("dlc" as const),
              url: "https://store.steampowered.com/app/" + appid + "/?cc=za",
            };
          }),
        );
        for (const item of batch) {
          if (item.status === "fulfilled" && item.value) data.push(item.value);
          else partial = true;
        }
      }
      return result(
        data,
        page,
        ids.length,
        page * limit < ids.length,
        "https://store.steampowered.com/dlc/" + id + "/?cc=za",
        true,
        partial,
      );
    }
    const items: RelatedProduct[] = [];
    const packages = game.package_groups?.flatMap((g) => g.subs ?? []) ?? [];
    if (packages.length > 1)
      for (const p of packages) {
        const title = requirementText(p.option_text);
        if (title)
          items.push({
            id: "steam-sub-" + p.packageid,
            title,
            kind: "package",
            url:
              "https://store.steampowered.com/sub/" + p.packageid + "/?cc=za",
          });
      }
    let partial = false;
    try {
      const html = await steamPage(id);
      if (!html.includes("game_area_purchase")) partial = true;
      const ids = steamBundleIds(html).slice(0, 20);
      if (ids.length) {
        const input = {
          ids: ids.map((bundleid) => ({ bundleid })),
          context: { language: "english", country_code: "ZA" },
        };
        const raw = await steamRequest<unknown>(
          "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=" +
            encodeURIComponent(JSON.stringify(input)),
        );
        const data = z
          .object({
            response: z.object({
              store_items: z
                .array(
                  z.object({
                    id: z.number(),
                    name: z.string(),
                    success: z.number().optional(),
                  }),
                )
                .optional(),
            }),
          })
          .parse(raw);
        for (const b of data.response.store_items ?? [])
          if (ids.includes(b.id) && b.success !== 0)
            items.push({
              id: "steam-bundle-" + b.id,
              title: b.name,
              kind: "bundle",
              url: "https://store.steampowered.com/bundle/" + b.id + "/?cc=za",
            });
      }
    } catch {
      partial = true;
    }
    return result(
      items.slice((page - 1) * limit, page * limit),
      page,
      items.length,
      page * limit < items.length,
      "https://store.steampowered.com/app/" + id + "/?cc=za#game_area_purchase",
      true,
      partial,
    );
  }
  if (source === "gog") {
    if (!/^[1-9]\d{0,9}$/.test(id)) return null;
    const productSchema = z.object({
      id: z.number(),
      title: z.string(),
      links: z.object({ product_card: z.string().optional() }).optional(),
      dlcs: z
        .union([
          z.object({
            products: z
              .array(z.object({ id: z.number().int().positive() }))
              .optional(),
          }),
          z.array(z.unknown()).length(0),
        ])
        .optional(),
    });
    const primary = productSchema.parse(
      (
        await publicStoreRequest(
          "https://api.gog.com/products/" + id + "?expand=description",
        )
      ).value,
    );
    const fallback = storeLink(primary.links?.product_card, "gog.com");
    const v2 = z
      .object({
        _links: z
          .object({
            includesGames: z.array(z.object({ href: z.string() })).optional(),
          })
          .optional(),
        _embedded: z.object({
          editions: z
            .array(
              z.object({
                id: z.number().int().positive(),
                name: z.string(),
                _links: z
                  .object({ self: z.object({ href: z.string() }).optional() })
                  .optional(),
              }),
            )
            .optional(),
        }),
      })
      .parse(
        (await publicStoreRequest("https://api.gog.com/v2/games/" + id)).value,
      );
    if (kind === "editions") {
      const items = (v2._embedded.editions ?? [])
        .filter((e) => String(e.id) !== id)
        .flatMap((e) => {
          const url = storeLink(e._links?.self?.href, "gog.com");
          return url
            ? [
                {
                  id: "gog-" + e.id,
                  title: e.name,
                  kind: "edition" as const,
                  url,
                },
              ]
            : [];
        });
      return result(
        items.slice((page - 1) * limit, page * limit),
        page,
        items.length,
        page * limit < items.length,
        fallback,
      );
    }
    const dlcIds = (product: z.infer<typeof productSchema>) =>
      !Array.isArray(product.dlcs)
        ? (product.dlcs?.products?.map((p) => p.id) ?? [])
        : [];
    let partial = false;
    const allIds = dlcIds(primary);
    const bases = [
      ...new Set(
        (v2._links?.includesGames ?? []).flatMap((link) => {
          try {
            const u = new URL(link.href);
            const m = /^\/v2\/games\/([1-9]\d{0,9})$/.exec(u.pathname);
            return u.protocol === "https:" &&
              u.hostname === "api.gog.com" &&
              m &&
              m[1] !== id
              ? [m[1]]
              : [];
          } catch {
            return [];
          }
        }),
      ),
    ].slice(0, 10);
    // Only follow explicit included-game links, never a guessed title match.
    for (let i = 0; i < bases.length; i += 4) {
      const records = await Promise.allSettled(
        bases
          .slice(i, i + 4)
          .map(async (base) =>
            productSchema.parse(
              (
                await publicStoreRequest(
                  "https://api.gog.com/products/" +
                    base +
                    "?expand=description",
                )
              ).value,
            ),
          ),
      );
      for (const item of records) {
        if (item.status === "fulfilled") allIds.push(...dlcIds(item.value));
        else partial = true;
      }
    }
    const ids = [...new Set(allIds)].filter((n) => String(n) !== id);
    const selected = ids.slice((page - 1) * limit, page * limit);
    if (!selected.length)
      return result([], page, ids.length, false, fallback, true, partial);
    const products = z
      .array(
        z.object({
          id: z.number(),
          title: z.string(),
          is_secret: z.boolean().optional(),
          links: z.object({ product_card: z.string().optional() }).optional(),
        }),
      )
      .parse(
        (
          await publicStoreRequest(
            "https://api.gog.com/products?ids=" + selected.join(","),
          )
        ).value,
      );
    const items = products
      .filter((p) => selected.includes(p.id) && !p.is_secret)
      .flatMap((p) => {
        const url = storeLink(p.links?.product_card, "gog.com");
        return url
          ? [{ id: "gog-" + p.id, title: p.title, kind: "dlc" as const, url }]
          : [];
      });
    return result(
      items,
      page,
      ids.length,
      page * limit < ids.length,
      fallback,
      true,
      partial || items.length < selected.length,
    );
  }
  if (source === "xbox" || source === "xboxpc") {
    if (!/^[A-Z0-9]{12}$/.test(id)) return null;
    const fallback = "https://www.xbox.com/en-ZA/games/store/-/" + id;
    if (kind === "editions")
      return result([], page, null, false, fallback, false);
    const raw = (
      await publicStoreRequest(
        "https://storeedgefd.dsx.mp.microsoft.com/v9.0/products/" +
          id +
          "/addOns?market=ZA&locale=en-za&deviceFamily=" +
          (source === "xboxpc" ? "Windows.Desktop" : "Windows.Xbox") +
          "&pageSize=" +
          limit,
      )
    ).value;
    const payload = z
      .object({
        Payload: z.object({
          AddOns: z.array(z.unknown()),
          TotalItems: z.number().int().nonnegative(),
        }),
      })
      .parse(raw).Payload;
    const items = payload.AddOns.flatMap((value) => {
      const p = z
        .object({
          ProductId: z.string().regex(/^[A-Z0-9]{12}$/),
          Title: z.string(),
        })
        .safeParse(value);
      return p.success && p.data.ProductId !== id
        ? [
            {
              id: source + "-" + p.data.ProductId,
              title: p.data.Title,
              kind: "dlc" as const,
              url:
                "https://www.xbox.com/en-ZA/games/store/-/" + p.data.ProductId,
            },
          ]
        : [];
    });
    return result(
      items,
      page,
      payload.TotalItems,
      false,
      fallback,
      true,
      payload.TotalItems > items.length,
    );
  }
  return result([], page, null, false, null, false);
}
