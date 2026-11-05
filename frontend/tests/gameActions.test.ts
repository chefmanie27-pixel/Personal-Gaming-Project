import { test } from "node:test";
import assert from "node:assert/strict";
import { effectScope, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore, authClient } from "../src/stores/auth";
import { socialClient } from "../src/stores/social";
import { alertsClient } from "../src/services/alerts";
import { useGameActions } from "../src/composables/useGameActions";
import type { Game } from "../src/types";
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } });
const alice = { id: "alice", email: "alice@example.invalid", role: "USER" };
function gate() {
  let release!: () => void, reject!: (e: Error) => void;
  const wait = new Promise<void>((resolve, fail) => { release = resolve; reject = fail; });
  return { wait, release, reject };
}
const reply = (config: any, data: any) => ({ config, data, status: 200, statusText: "OK", headers: {} });
const flush = () => new Promise(r => setTimeout(r, 0));
function setup() {
  setActivePinia(createPinia()); const auth = useAuthStore(); auth.token = "alice-token"; auth.user = alice;
  const game = ref<Game | undefined>({ slug: "steam-100" } as Game), route = ref("steam-100"), scope = effectScope();
  const actions = scope.run(() => useGameActions(game, () => route.value))!;
  socialClient.defaults.adapter = async c => reply(c, { data: { priceAvailable: true, recorded: true } });
  authClient.defaults.adapter = async c => reply(c, { data: {} });
  alertsClient.defaults.adapter = async c => reply(c, { data: { active: true } });
  return { auth, game, route, scope, actions };
}
test("wishlist duplicate starts are blocked through reconciliation and write, and old acknowledgements stay private", async () => {
  const { auth, actions, scope } = setup(), canonical = gate(), write = gate();
  let reconciliations = 0, writes = 0;
  socialClient.defaults.adapter = async c => { reconciliations++; await canonical.wait; return reply(c, { data: {} }); };
  authClient.defaults.adapter = async c => { writes++; await write.wait; return reply(c, { data: {} }); };
  try {
    const request = actions.saveToWishlist(); await actions.saveToWishlist(); await flush();
    assert.equal(reconciliations, 1); assert.equal(writes, 0); assert.equal(actions.wishlistBusy.value, true);
    canonical.release(); await flush(); await actions.saveToWishlist(); assert.equal(writes, 1);
    auth.logout(); assert.equal(actions.wishlistBusy.value, false);
    write.release(); await request; assert.equal(actions.wishlistMessage.value, "");
  } finally { canonical.release(); write.release(); scope.stop(); }
});
test("a changed game or disposed view cannot continue a wishlist write after reconciliation", async () => {
  for (const dispose of [false, true]) {
    const { game, route, actions, scope } = setup(), canonical = gate(); let writes = 0;
    socialClient.defaults.adapter = async c => { await canonical.wait; return reply(c, { data: {} }); };
    authClient.defaults.adapter = async c => { writes++; return reply(c, { data: {} }); };
    try {
      const request = actions.saveToWishlist(); await flush();
      if (dispose) scope.stop(); else { game.value = { slug: "steam-101" } as Game; route.value = "steam-101"; }
      canonical.release(); await request; assert.equal(writes, 0); assert.equal(actions.wishlistMessage.value, "");
    } finally { canonical.release(); scope.stop(); }
  }
});
test("an old observation failure cannot clear a new request after same-token reauthentication", async () => {
  const { auth, actions, scope } = setup(), old = gate(), fresh = gate(); let requests = 0;
  socialClient.defaults.adapter = async c => { const pending = requests++ === 0 ? old : fresh; await pending.wait; return reply(c, { data: { priceAvailable: true, recorded: true } }); };
  try {
    const first = actions.saveObservation(); await flush(); auth.logout(); auth.token = "alice-token"; auth.user = alice;
    const second = actions.saveObservation(); await flush(); old.reject(new Error("old failure")); await first;
    assert.equal(actions.observing.value, true); assert.equal(actions.observationMessage.value, ""); assert.equal(actions.historyRevision.value, 0);
    fresh.release(); await second; assert.equal(actions.observing.value, false); assert.equal(actions.historyRevision.value, 1); assert.match(actions.observationMessage.value, /saved/);
  } finally { old.release(); fresh.release(); scope.stop(); }
});
test("obsolete alert completion cannot clear a newer save, and current failure preserves the submitted target", async () => {
  const { auth, actions, scope } = setup(), old = gate(), fresh = gate(), payloads: any[] = [];
  alertsClient.defaults.adapter = async c => { const pending = payloads.length === 0 ? old : fresh; payloads.push(JSON.parse(c.data)); await pending.wait; return reply(c, { data: { active: false }, existing: true }); };
  try {
    actions.targetPrice.value = 80; const first = actions.setPriceAlert(); await flush();
    auth.logout(); auth.token = "alice-token"; auth.user = alice; assert.equal(actions.targetPrice.value, undefined);
    actions.targetPrice.value = 160; const second = actions.setPriceAlert(); await flush();
    old.release(); await first; assert.equal(actions.savingAlert.value, true); assert.equal(actions.alertMessage.value, "");
    fresh.reject(new Error("current failure")); await second; assert.equal(actions.savingAlert.value, false); assert.ok(actions.alertMessage.value); assert.equal(actions.targetPrice.value, 160);
    assert.deepEqual(payloads.map(p => p.target), [80, 160]);
  } finally { old.release(); fresh.release(); scope.stop(); }
});

test("invalid alert targets send no requests, and session reset clears validation and native control state", async () => {
  const { auth, actions, scope } = setup(); let requests = 0;
  socialClient.defaults.adapter = async c => { requests++; return reply(c, { data: {} }); };
  alertsClient.defaults.adapter = async c => { requests++; return reply(c, { data: {} }); };
  try {
    assert.equal(actions.targetError.value, "");
    for (const target of [undefined, 0, -1, 1.001, Infinity]) {
      actions.targetPrice.value = target; await actions.setPriceAlert();
      assert.match(actions.targetError.value, /positive target/);
    }
    assert.equal(requests, 0);
    const revision = actions.targetControlRevision.value;
    auth.logout(); assert.equal(actions.targetError.value, ""); assert.equal(actions.targetPrice.value, undefined);
    assert.ok(actions.targetControlRevision.value > revision);
  } finally { scope.stop(); }
});
