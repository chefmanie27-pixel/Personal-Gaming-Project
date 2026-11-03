import type { GamingGoal, JournalItem, Workspace } from "../stores/workspace";
import type { LibraryEntry } from "../stores/library";
export interface DayActivity {
  minutes: number;
  sessions: number;
}
export function sessionDays(entries: JournalItem[], year: number) {
  const days: Record<string, DayActivity> = {};
  for (const e of entries)
    if (e.kind === "session" && e.date.startsWith(year + "-")) {
      const old = days[e.date] ?? { minutes: 0, sessions: 0 };
      days[e.date] = {
        minutes: old.minutes + e.minutes,
        sessions: old.sessions + 1,
      };
    }
  return days;
}
export function goalProgress(
  goal: GamingGoal,
  library: LibraryEntry[],
  workspace: Workspace,
  days: Record<string, DayActivity> | null,
  today: string,
) {
  const inRange = (date: string) =>
    date >= goal.start && date <= goal.end && date <= today;
  if (goal.kind === "completed")
    return library.filter(
      (e) =>
        e.status === "Completed" &&
        !!workspace.metadata[e.game.slug]?.completedAt &&
        inRange(workspace.metadata[e.game.slug].completedAt!),
    ).length;
  if (!days) return null;
  return Object.entries(days)
    .filter(([date]) => inRange(date))
    .reduce(
      (sum, [, d]) => sum + (goal.kind === "minutes" ? d.minutes : d.sessions),
      0,
    );
}
export function privateTimeline(
  library: LibraryEntry[],
  workspace: Workspace,
  journal: JournalItem[],
) {
  const events = [
    ...library.map((e) => ({
      id: "added:" + e.game.slug,
      date: e.addedAt.slice(0, 10),
      title: e.game.title,
      kind: "Game added",
    })),
    ...library.flatMap((e) =>
      e.status === "Completed" && workspace.metadata[e.game.slug]?.completedAt
        ? [
            {
              id: "completed:" + e.game.slug,
              date: workspace.metadata[e.game.slug].completedAt!,
              title: e.game.title,
              kind: "Recorded completion",
            },
          ]
        : [],
    ),
    ...journal.map((e) => ({
      id: "journal:" + e.id,
      date: e.date,
      title: e.game.title,
      kind:
        e.kind === "session"
          ? "Play session recorded"
          : "Private review recorded",
    })),
  ];
  return events.sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
}
