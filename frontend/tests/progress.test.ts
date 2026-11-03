import { test } from "node:test";
import assert from "node:assert/strict";
import {
  goalProgress,
  privateTimeline,
  sessionDays,
} from "../src/utils/progress";
import { blankWorkspace } from "../src/stores/workspace";
import type { LibraryEntry } from "../src/stores/library";
const game = {
  id: "steam-1",
  slug: "steam-1",
  title: "One",
  genres: ["RPG"],
  platforms: ["PC"],
};
const entry = {
  game,
  status: "Completed",
  favorite: false,
  rating: null,
  hours: 9000,
  notes: "PRIVATE",
  addedAt: "2026-01-02T00:00:00.000Z",
} as LibraryEntry;
test("goals use explicit dates/sessions, exclude future records and distinguish unavailable summaries", () => {
  const w = blankWorkspace();
  w.metadata["steam-1"] = {
    completedAt: null,
    priority: "Normal",
    collectionIds: [],
  };
  const goal = {
    id: "x",
    title: "Three games",
    kind: "completed" as const,
    target: 3,
    start: "2026-01-01",
    end: "2026-12-31",
  };
  assert.equal(goalProgress(goal, [entry], w, {}, "2026-11-03"), 0);
  w.metadata["steam-1"].completedAt = "2026-12-01";
  assert.equal(goalProgress(goal, [entry], w, {}, "2026-11-03"), 0);
  w.metadata["steam-1"].completedAt = "2026-02-01";
  assert.equal(goalProgress(goal, [entry], w, {}, "2026-11-03"), 1);
  assert.equal(
    goalProgress({ ...goal, kind: "minutes" }, [entry], w, null, "2026-11-03"),
    null,
  );
  assert.equal(
    goalProgress(
      { ...goal, kind: "minutes" },
      [entry],
      w,
      {
        "2026-02-01": { sessions: 2, minutes: 90 },
        "2026-12-01": { sessions: 1, minutes: 60 },
      },
      "2026-11-03",
    ),
    90,
  );
});
test("daily aggregation and private timeline never infer activity from lifetime hours", () => {
  const w = blankWorkspace();
  w.journal = [
    {
      id: "j",
      game,
      date: "2026-02-01",
      kind: "session",
      minutes: 40,
      notes: "SECRET",
      progress: "secret",
      tags: [],
      spoiler: false,
      rating: null,
    },
  ] as any;
  assert.deepEqual(sessionDays(w.journal, 2026), {
    "2026-02-01": { minutes: 40, sessions: 1 },
  });
  assert.deepEqual(sessionDays(w.journal, 2025), {});
  const timeline = privateTimeline([entry], w, w.journal);
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].kind, "Play session recorded");
  assert.doesNotMatch(JSON.stringify(timeline), /SECRET|9000|PRIVATE/);
});
