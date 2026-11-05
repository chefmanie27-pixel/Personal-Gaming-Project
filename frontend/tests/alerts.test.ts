import { test } from "node:test";
import assert from "node:assert/strict";
import { effectScope, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { AxiosError } from "axios";
import { useAuthStore } from "../src/stores/auth";
import { usePriceAlerts } from "../src/composables/usePriceAlerts";
import { alertsClient, type PriceAlert } from "../src/services/alerts";
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
const alice = { id: "alice", email: "alice@example.invalid", role: "USER" },
  bob = { id: "bob", email: "bob@example.invalid", role: "USER" };
function row(id = "alert-a", active = true) {
  return {
    id,
    active,
    target: "80",
    currency: "ZAR",
    listing: {
      game: { slug: "steam-1", title: id, cover: "" },
      store: { name: "Steam" },
      prices: [],
    },
  } as PriceAlert;
}
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  return { wait, release };
}
function response(config: any, payload: any) {
  return {
    data: { data: payload },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  };
}
function setup() {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.token = "alice-token";
  auth.user = alice;
  const scope = effectScope();
  const alerts = scope.run(() => usePriceAlerts())!;
  return { auth, scope, alerts };
}
async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}
test("old alert mutation cannot clear a new load or announce after logout and same-token sign-in", async () => {
  const mutation = gate(),
    read = gate();
  let holdRead = false;
  alertsClient.defaults.adapter = async (c) => {
    if (c.method === "patch") {
      await mutation.wait;
      return response(c, null);
    }
    if (holdRead) await read.wait;
    return response(c, [row()]);
  };
  const { auth, scope, alerts } = setup();
  try {
    await flush();
    const old = alerts.toggle(alerts.alerts.value[0]);
    auth.logout();
    await nextTick();
    assert.equal(alerts.busy.value, false);
    assert.deepEqual(alerts.alerts.value, []);
    holdRead = true;
    auth.token = "alice-token";
    auth.user = alice;
    await nextTick();
    assert.equal(alerts.loading.value, true);
    mutation.release();
    await old;
    assert.equal(alerts.loading.value, true);
    assert.equal(alerts.busy.value, true);
    assert.equal(alerts.notice.value, "");
    read.release();
    await flush();
    assert.equal(alerts.busy.value, false);
    assert.equal(alerts.alerts.value.length, 1);
  } finally {
    mutation.release();
    read.release();
    scope.stop();
  }
});
test("obsolete delete failures cannot replace another account alerts or error state", async () => {
  const pending = gate();
  alertsClient.defaults.adapter = async (c) => {
    if (c.method === "delete") {
      assert.equal(c.headers.Authorization, "Bearer alice-token");
      await pending.wait;
      throw new AxiosError("old failure", "ERR_BAD_REQUEST", c, undefined, {
        ...response(c, {}),
        status: 401,
      });
    }
    return response(c, [
      row(
        c.headers.Authorization === "Bearer bob-token"
          ? "bob-alert"
          : "alice-alert",
      ),
    ]);
  };
  const { auth, scope, alerts } = setup();
  try {
    await flush();
    const old = alerts.remove(alerts.alerts.value[0]);
    auth.token = "bob-token";
    auth.user = bob;
    await nextTick();
    await flush();
    pending.release();
    await old;
    assert.equal(alerts.alerts.value[0].id, "bob-alert");
    assert.equal(alerts.error.value, "");
    assert.equal(alerts.notice.value, "");
    assert.equal(alerts.busy.value, false);
  } finally {
    pending.release();
    scope.stop();
  }
});
test("failed loading can be retried without stale errors or false saving state", async () => {
  let fail = true;
  alertsClient.defaults.adapter = async (c) => {
    if (fail) throw new Error("offline");
    return response(c, []);
  };
  const { scope, alerts } = setup();
  try {
    await flush();
    assert.ok(alerts.error.value);
    assert.equal(alerts.busy.value, false);
    assert.equal(alerts.loading.value, false);
    fail = false;
    await alerts.load();
    assert.equal(alerts.error.value, "");
    assert.deepEqual(alerts.alerts.value, []);
  } finally {
    scope.stop();
  }
});
test("repeat toggle while pending sends one captured target and failed writes preserve current data", async () => {
  let writes = 0;
  const pending = gate();
  alertsClient.defaults.adapter = async (c) => {
    if (c.method === "patch") {
      writes++;
      assert.equal(JSON.parse(c.data).active, false);
      await pending.wait;
      return response(c, null);
    }
    return response(c, [row()]);
  };
  const { scope, alerts } = setup();
  try {
    await flush();
    const alert = alerts.alerts.value[0];
    const first = alerts.toggle(alert);
    assert.equal(await alerts.toggle(alert), false);
    pending.release();
    assert.equal(await first, true);
    assert.equal(writes, 1);
    assert.equal(alerts.alerts.value[0].active, false);
    alertsClient.defaults.adapter = async () => {
      throw Error("failed save");
    };
    assert.equal(await alerts.remove(alerts.alerts.value[0]), false);
    assert.equal(alerts.alerts.value.length, 1);
    assert.ok(alerts.error.value);
  } finally {
    pending.release();
    scope.stop();
  }
});
test("unmounted alert views discard late responses and clear private records", async () => {
  const pending = gate();
  alertsClient.defaults.adapter = async (c) => {
    await pending.wait;
    return response(c, [row()]);
  };
  const { scope, alerts } = setup();
  scope.stop();
  pending.release();
  await flush();
  assert.deepEqual(alerts.alerts.value, []);
  assert.equal(alerts.busy.value, false);
  assert.equal(alerts.notice.value, "");
  assert.equal(alerts.error.value, "");
});
