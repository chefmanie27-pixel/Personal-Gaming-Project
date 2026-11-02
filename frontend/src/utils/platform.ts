import type { Game } from "../types";
import type { LibraryEntry } from "../stores/library";
import type { Workspace } from "../stores/workspace";
export function exactReleaseDate(value: string): string | null {
  const yearMatch = value.match(/\b(\d{4})\b/);
  if (
    yearMatch &&
    (Number(yearMatch[1]) < 1970 ||
      Number(yearMatch[1]) > new Date().getFullYear() + 15)
  )
    return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = value.slice(0, 10);
    const parsed = new Date(date + "T12:00:00Z");
    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
      ? date
      : null;
  }
  const match = /^(\d{1,2}) ([A-Za-z]{3}),? (\d{4})$/.exec(value);
  if (!match) return null;
  const month = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(match[2].toLowerCase());
  if (month < 0) return null;
  const date = new Date(
    Date.UTC(Number(match[3]), month, Number(match[1]), 12),
  );
  return date.getUTCFullYear() === Number(match[3]) &&
    date.getUTCMonth() === month &&
    date.getUTCDate() === Number(match[1])
    ? date.toISOString().slice(0, 10)
    : null;
}
export function recommend(
  candidates: Game[],
  library: LibraryEntry[],
  preferences: Workspace["preferences"],
  limit = 8,
) {
  const known = new Set(library.map((e) => e.game.slug)),
    titles = new Set(library.map((e) => e.game.title.toLowerCase()));
  const weights = new Map<string, number>();
  for (const genre of preferences.genres) weights.set(genre, 4);
  for (const entry of library)
    for (const genre of entry.game.genres ?? [])
      weights.set(
        genre,
        (weights.get(genre) ?? 0) +
          (entry.favorite
            ? 3
            : entry.rating !== null && entry.rating >= 7
              ? 2
              : 1),
      );
  const seen = new Set<string>();
  return candidates
    .filter((g) => {
      const title = g.title.toLowerCase();
      if (
        known.has(g.slug) ||
        titles.has(title) ||
        seen.has(title) ||
        g.status === "upcoming"
      )
        return false;
      seen.add(title);
      return true;
    })
    .map((game) => {
      const matches = game.genres.filter((g) => weights.has(g));
      const preferredPlatform =
        !preferences.platforms.length ||
        game.platforms.some((p) => preferences.platforms.includes(p));
      const affinity = matches.reduce(
        (sum, g) => sum + (weights.get(g) ?? 0),
        0,
      );
      const score =
        affinity * 10 + (preferredPlatform ? 15 : 0) + (game.score ?? 0) * 0.15;
      return {
        game,
        score,
        reason: matches.length
          ? "Because your preferences or library include " + matches.join(", ")
          : preferences.platforms.length && preferredPlatform
            ? "Available on a preferred platform."
            : "From the current storefront discovery catalogue.",
      };
    })
    .filter(
      (r) =>
        !preferences.platforms.length ||
        r.game.platforms.some((p) => preferences.platforms.includes(p)),
    )
    .sort(
      (a, b) => b.score - a.score || a.game.title.localeCompare(b.game.title),
    )
    .slice(0, limit);
}
export function randomEntry<T extends { game: Game }>(
  entries: T[],
  previousSlug: string | undefined,
  random = Math.random,
): T | undefined {
  const pool =
    entries.length > 1
      ? entries.filter((e) => e.game.slug !== previousSlug)
      : entries;
  return pool.length
    ? pool[
        Math.min(
          pool.length - 1,
          Math.floor(
            Math.max(0, Math.min(0.999999999, random())) * pool.length,
          ),
        )
      ]
    : undefined;
}
export function annualStats(
  library: LibraryEntry[],
  workspace: Workspace,
  year: number,
) {
  const sessions = workspace.journal.filter(
    (e) => e.kind === "session" && e.date.startsWith(year + "-"),
  );
  const completed = library.filter(
    (e) =>
      e.status === "Completed" &&
      workspace.metadata[e.game.slug]?.completedAt?.startsWith(year + "-"),
  );
  const monthly = Array.from({ length: 12 }, (_, month) => ({
    month: month + 1,
    completed: completed.filter(
      (e) =>
        Number(workspace.metadata[e.game.slug].completedAt!.slice(5, 7)) ===
        month + 1,
    ).length,
    minutes: sessions
      .filter((e) => Number(e.date.slice(5, 7)) === month + 1)
      .reduce((sum, e) => sum + e.minutes, 0),
  }));
  const playtime = new Map<string, { game: Game; minutes: number }>();
  for (const e of sessions) {
    const previous = playtime.get(e.game.slug);
    playtime.set(e.game.slug, {
      game: e.game,
      minutes: (previous?.minutes ?? 0) + e.minutes,
    });
  }
  const rated = workspace.journal
    .filter(
      (e) =>
        e.kind === "review" &&
        e.rating !== null &&
        e.date.startsWith(year + "-"),
    )
    .sort((a, b) => b.rating! - a.rating!);
  const genres = new Map<string, number>();
  for (const session of sessions)
    for (const genre of session.game.genres)
      genres.set(genre, (genres.get(genre) ?? 0) + session.minutes);
  return {
    genres: [...genres].sort((a, b) => b[1] - a[1]),
    completed: completed.length,
    minutes: sessions.reduce((sum, e) => sum + e.minutes, 0),
    monthly,
    mostPlayed:
      [...playtime.values()].sort((a, b) => b.minutes - a.minutes)[0] ?? null,
    highestRated: rated[0] ?? null,
    undatedCompletions: library.filter(
      (e) =>
        e.status === "Completed" &&
        !workspace.metadata[e.game.slug]?.completedAt,
    ).length,
  };
}
