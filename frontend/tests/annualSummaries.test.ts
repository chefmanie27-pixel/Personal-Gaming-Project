import { test } from "node:test";
import assert from "node:assert/strict";
import { effectScope, nextTick, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "../src/stores/auth";
import { blankWorkspace, useWorkspaceStore, workspaceClient } from "../src/stores/workspace";
import { journalClient } from "../src/stores/journal";
import { useAnnualSummaries } from "../src/composables/useAnnualSummaries";
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } });
const reply = (config: any, data: any) => ({ config, data, status: 200, statusText: "OK", headers: {} });
async function setup() {
  setActivePinia(createPinia());
  const auth = useAuthStore(); auth.token = "alice-token"; auth.user = { id: "alice", email: "alice@example.invalid", role: "USER" };
  workspaceClient.defaults.adapter = async c => reply(c, { data: blankWorkspace(), version: 0, journalMode: "normalized" });
  const workspace = useWorkspaceStore(); await workspace.connect(auth.token, "alice");
  const scope = effectScope(), year = ref(2026);
  const annual = scope.run(() => useAnnualSummaries(year))!;
  return { auth, scope, year, annual };
}
const flush = async () => { await new Promise(r => setTimeout(r, 0)); await nextTick(); };
test("annual years load independently and a failed previous year is unavailable until retry", async () => {
  let fail = true;
  journalClient.defaults.adapter = async c => {
    if (c.params.year === 2025 && fail) throw new Error("offline");
    return reply(c, { data: { minutes: c.params.year === 2026 ? 120 : 0 } });
  };
  const { scope, annual } = await setup();
  try {
    await flush();
    assert.equal(annual.selected.value?.minutes, 120);
    assert.equal(annual.previous.value, null);
    assert.match(annual.previousError.value, /retry/);
    assert.equal(annual.error.value, "");
    fail = false; await annual.load(true);
    assert.equal(annual.previous.value?.minutes, 0);
    assert.equal(annual.selected.value?.minutes, 120);
    assert.equal(annual.previousError.value, "");
  } finally { scope.stop(); }
});
test("late annual responses cannot replace another year or survive account changes and disposal", async () => {
  const pending: { config: any; resolve: (v: any) => void; reject: (e: Error) => void }[] = [];
  journalClient.defaults.adapter = c => new Promise((resolve, reject) => pending.push({ config: c, resolve, reject }));
  const { scope, year, annual, auth } = await setup();
  try {
    year.value = 2027; await nextTick();
    for (const p of pending.slice(0, 2)) p.resolve(reply(p.config, { data: { minutes: 999 } }));
    await flush(); assert.equal(annual.selected.value, null); assert.equal(annual.previous.value, null);
    for (const p of pending.slice(2, 4)) p.resolve(reply(p.config, { data: { minutes: p.config.params.year } }));
    await flush(); assert.equal(annual.selected.value?.minutes, 2027); assert.equal(annual.previous.value?.minutes, 2026);
    const request = annual.load(); auth.token = "different-token";
    pending[4].reject(new Error("old account failure")); await request;
    assert.equal(annual.error.value, "");
    await nextTick(); scope.stop();
    for (const p of pending.slice(5)) p.resolve(reply(p.config, { data: { minutes: 999 } }));
    await flush(); assert.equal(annual.selected.value, null);
  } finally { scope.stop(); }
});
