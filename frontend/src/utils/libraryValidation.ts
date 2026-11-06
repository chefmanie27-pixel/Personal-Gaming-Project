import type { LibraryEntry } from "../stores/library";
export const libraryStatuses = ["Want to Play", "Currently Playing", "Completed", "On Hold", "Dropped"] as const;
export function validateLibraryEntries(saved: unknown): LibraryEntry[] {
  if (!Array.isArray(saved) || !saved.every((e): e is LibraryEntry =>
    !!e && typeof e.game?.slug === "string" && e.game.slug.length > 0 && typeof e.game.title === "string" &&
    Array.isArray(e.game.genres) && e.game.genres.every((g: unknown) => typeof g === "string") &&
    Array.isArray(e.game.platforms) && e.game.platforms.every((g: unknown) => typeof g === "string") &&
    typeof e.game.store === "string" && libraryStatuses.includes(e.status) && typeof e.favorite === "boolean" &&
    (e.rating === null || (Number.isFinite(e.rating) && e.rating >= 0 && e.rating <= 10)) &&
    Number.isFinite(e.hours) && e.hours >= 0 && typeof e.notes === "string" && typeof e.addedAt === "string"
  )) throw new Error("Invalid saved library");
  return saved;
}
