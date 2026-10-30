import type { Game } from "../types";
export type StorefrontId =
  "steam" | "gog" | "epic" | "xbox" | "xboxpc" | "playstation" | "nintendo";
const labels: Record<StorefrontId, string> = {
  steam: "Steam",
  gog: "GOG",
  epic: "Epic Games Store",
  xbox: "Xbox",
  xboxpc: "Xbox PC",
  playstation: "PlayStation Store",
  nintendo: "Nintendo",
};
function known(value: string): StorefrontId | undefined {
  return (
    {
      steam: "steam",
      gog: "gog",
      "gog.com": "gog",
      epic: "epic",
      "epic-games": "epic",
      "epic games store": "epic",
      xbox: "xbox",
      "xbox console": "xbox",
      "xbox-store": "xbox",
      xboxpc: "xboxpc",
      "xbox pc": "xboxpc",
      playstation: "playstation",
      "playstation store": "playstation",
      "playstation-store": "playstation",
      nintendo: "nintendo",
      "nintendo store": "nintendo",
    } as Record<string, StorefrontId>
  )[value.toLowerCase().trim()];
}
export function gameStorefronts(
  game: Pick<
    Game,
    "slug" | "store" | "storeUrl" | "storeLinks" | "storefronts"
  >,
): { id: StorefrontId; label: string }[] {
  const ids = new Set<StorefrontId>();
  const primary = known(game.slug.split("-")[0]);
  if (primary) ids.add(primary);
  for (const store of game.storefronts ?? []) {
    const id = known(store);
    if (id) ids.add(id);
  }
  const named = known(game.store);
  if (named)
    ids.add(primary === "xboxpc" && named === "xbox" ? "xboxpc" : named);
  for (const link of [game.storeUrl, ...(game.storeLinks ?? [])]) {
    if (!link) continue;
    try {
      const u = new URL(link);
      if (u.protocol !== "https:") continue;
      const host = u.hostname;
      const id =
        host === "store.steampowered.com"
          ? "steam"
          : ["www.gog.com", "gog.com"].includes(host)
            ? "gog"
            : host === "store.epicgames.com"
              ? "epic"
              : ["www.xbox.com", "xbox.com"].includes(host)
                ? primary === "xboxpc"
                  ? "xboxpc"
                  : "xbox"
                : host === "store.playstation.com"
                  ? "playstation"
                  : host === "nintendo.com" ||
                      host.endsWith(".nintendo.com") ||
                      host === "nintendo.co.za" ||
                      host.endsWith(".nintendo.co.za")
                    ? "nintendo"
                    : undefined;
      if (id) ids.add(id);
    } catch {
      /* Ignore malformed provider links. */
    }
  }
  return [...ids].map((id) => ({ id, label: labels[id] }));
}
