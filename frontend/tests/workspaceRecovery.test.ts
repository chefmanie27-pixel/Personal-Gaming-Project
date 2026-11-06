import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { blankWorkspace, useWorkspaceStore, workspaceClient } from "../src/stores/workspace";
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
const response = (config: any, data: any) => ({ config, data, status: 200, statusText: "OK", headers: {} });
test("malformed nested device workspace records are rejected without rewriting their source", async () => {
  const invalid = [null, false, 0, { ...blankWorkspace(), profile: null }, { ...blankWorkspace(), preferences: { genres: [null], platforms: [] } }, { ...blankWorkspace(), journal: [null] }, { ...blankWorkspace(), metadata: [] }, { ...blankWorkspace(), watches: [{ game: null, followedAt: "2026-01-01" }] }, { ...blankWorkspace(), goals: [{ id: "goal", title: "Invalid", kind: "minutes", target: -1, start: "2026-01-01", end: "2026-01-02" }] }];
  for (const value of invalid) {
    storage.clear(); const raw = JSON.stringify(value); storage.set("gamevault_workspace_v1", raw); setActivePinia(createPinia());
    const workspace = useWorkspaceStore(); await workspace.connect(null, null);
    assert.ok(workspace.error, "reject " + raw); assert.equal(workspace.ready, false); assert.equal(await workspace.change(d => { d.profile.name = "Must not write"; }), false);
    assert.equal(storage.get("gamevault_workspace_v1"), raw); assert.deepEqual(workspace.data, blankWorkspace());
  }
});
test("malformed device journal starts no account import", async () => {
  storage.clear(); const raw = JSON.stringify({ ...blankWorkspace(), journal: [{ id: "device-malformed", game: null }] }); storage.set("gamevault_workspace_v1", raw); setActivePinia(createPinia()); let writes = 0;
  workspaceClient.defaults.adapter = async c => { if (c.method !== "get") writes++; return response(c, { data: blankWorkspace(), version: 0, journalMode: "normalized" }); };
  const workspace = useWorkspaceStore(); await workspace.connect("alice", "alice");
  assert.equal(await workspace.importDevice(), false); assert.equal(writes, 0); assert.equal(storage.get("gamevault_workspace_v1"), raw);
});

test("workspace recovery preserves active account data and clears only the device failure", async () => {
  storage.clear(); const raw = JSON.stringify({ ...blankWorkspace(), preferences: { genres: null, platforms: [] } }); storage.set("gamevault_workspace_v1", raw); setActivePinia(createPinia());
  const account = blankWorkspace(); account.profile.name = "Private account";
  workspaceClient.defaults.adapter = async c => response(c, { data: account, version: 0, journalMode: "normalized" });
  const workspace = useWorkspaceStore(); await workspace.connect("alice", "alice"); assert.equal(await workspace.importDevice(), false);
  assert.ok(workspace.deviceError); assert.equal(workspace.error, ""); assert.equal(workspace.deviceBackup(), raw); assert.equal(workspace.data.profile.name, "Private account");
  const repaired = blankWorkspace(); repaired.profile.name = "Device profile"; storage.set("gamevault_workspace_v1", JSON.stringify(repaired));
  assert.equal(workspace.reloadDevice(), true); assert.equal(workspace.deviceError, ""); assert.equal(workspace.data.profile.name, "Private account");
  await workspace.connect(null, null); assert.equal(workspace.ready, true); assert.equal(workspace.data.profile.name, "Device profile");
});
test("oversized local snapshots and malformed account responses fail without publishing partial state", async () => {
  storage.clear(); const raw = JSON.stringify(blankWorkspace()) + " ".repeat(4 * 1024 * 1024); storage.set("gamevault_workspace_v1", raw); setActivePinia(createPinia());
  const workspace = useWorkspaceStore(); await workspace.connect(null, null); assert.ok(workspace.error); assert.equal(storage.get("gamevault_workspace_v1"), raw);
  workspaceClient.defaults.adapter = async c => response(c, { data: { ...blankWorkspace(), profile: null }, version: 0 });
  await workspace.connect("alice", "alice"); assert.equal(workspace.ready, false); assert.ok(workspace.error); assert.deepEqual(workspace.data, blankWorkspace());
});
