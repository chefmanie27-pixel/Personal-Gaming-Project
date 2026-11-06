import { test } from "node:test";
import assert from "node:assert/strict";
import { blankWorkspace } from "../src/stores/workspace";
import { validateWorkspaceSnapshot } from "../src/utils/workspaceValidation";
test("workspace reads retain legacy IDs and safely default missing optional fields without mutating input", () => {
  const input = { collections: [{ id: "legacy-collection", name: "Old collection" }], metadata: { "steam-10": { collectionIds: ["legacy-collection"] } }, journal: [], watches: [], preferences: { priceAlertRules: { "steam-10": {} } } };
  const raw = JSON.stringify(input), result = validateWorkspaceSnapshot(input);
  assert.deepEqual(result.preferences.priceAlertRules?.["steam-10"], { mode: "target", percent: 20, cooldownHours: 24 });
  assert.equal(result.profile.name, ""); assert.deepEqual(result.preferences.genres, []); assert.equal(result.metadata["steam-10"].priority, "Normal"); assert.equal(JSON.stringify(input), raw);
});
test("workspace validation rejects dangerous dictionary keys, bad dates, duplicates and broken references", () => {
  const bad = [
    { ...blankWorkspace(), metadata: { "steam-10": { priority: "Normal", completedAt: "2026-02-30", collectionIds: [] } } },
    { ...blankWorkspace(), metadata: { "steam-10": { priority: "Normal", completedAt: null, collectionIds: ["missing"] } } },
    { ...blankWorkspace(), collections: [{ id: "same", name: "One" }, { id: "same", name: "Two" }] },
    { ...blankWorkspace(), preferences: { genres: [], platforms: [], recommendationFeedback: { "steam-10": { choice: "unknown", title: "X", genres: [], at: "bad" } } } },
    JSON.parse('{"metadata":{"__proto__":{"collectionIds":[]}}}'),
    { ...blankWorkspace(), goals: Array.from({ length: 51 }, () => ({})) },
  ];
  for (const value of bad) assert.throws(() => validateWorkspaceSnapshot(value));
  assert.deepEqual(validateWorkspaceSnapshot({}), blankWorkspace());
});
