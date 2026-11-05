import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { AxiosError } from "axios";
import { useAuthStore, authClient } from "../src/stores/auth";
const data = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  },
});
Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: { hash: "", pathname: "/", search: "" },
});
Object.defineProperty(globalThis, "history", {
  configurable: true,
  value: { replaceState: () => {} },
});
const alice = { id: "alice", email: "alice@example.invalid", role: "USER" },
  bob = { id: "bob", email: "bob@example.invalid", role: "USER" };
function setup() {
  data.clear();
  location.hash = "";
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.token = "alice-token";
  auth.user = alice;
  return auth;
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
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
test("a delayed sign-in check cannot restore identity after sign-out", async () => {
  const auth = setup(),
    gate = deferred();
  authClient.defaults.adapter = async (c) => {
    await gate.promise;
    return response(c, alice);
  };
  const pending = auth.restore();
  auth.logout();
  gate.release();
  await pending;
  assert.equal(auth.token, null);
  assert.equal(auth.user, null);
  assert.equal(data.has("gamevault_token"), false);
});
test("an old 401 cannot sign out a newer account", async () => {
  const auth = setup(),
    gate = deferred();
  authClient.defaults.adapter = async (c) => {
    if (c.url === "/auth/login")
      return response(c, { token: "bob-token", user: bob });
    await gate.promise;
    throw new AxiosError("expired", "ERR_BAD_REQUEST", c, undefined, {
      ...response(c, {}),
      status: 401,
    });
  };
  const pending = auth.restore();
  await auth.login("bob@example.invalid", "password");
  gate.release();
  await pending;
  assert.equal(auth.token, "bob-token");
  assert.equal(auth.user?.id, "bob");
  assert.equal(data.get("gamevault_token"), "bob-token");
});
test("a newer login wins when credential responses arrive out of order", async () => {
  const auth = setup(),
    gate = deferred();
  authClient.defaults.adapter = async (c) => {
    const body = JSON.parse(c.data);
    if (body.email === "alice@example.invalid") {
      await gate.promise;
      return response(c, { token: "alice-new-token", user: alice });
    }
    return response(c, { token: "bob-token", user: bob });
  };
  const older = auth.login(alice.email, "password");
  const settled = older.catch(() => {});
  await auth.login(bob.email, "password");
  gate.release();
  await settled;
  assert.equal(auth.user?.id, "bob");
  assert.equal(auth.token, "bob-token");
  assert.equal(data.get("gamevault_token"), "bob-token");
});
test("a late Steam exchange cannot sign back in after sign-out", async () => {
  const auth = setup(),
    gate = deferred();
  location.hash = "#steam_code=one-use-code";
  let identityReads = 0;
  authClient.defaults.adapter = async (c) => {
    if (c.url === "/auth/steam/exchange") {
      await gate.promise;
      return response(c, { token: "steam-token" });
    }
    identityReads++;
    return response(c, alice);
  };
  const pending = auth.restore();
  auth.logout();
  gate.release();
  await pending;
  assert.equal(auth.user, null);
  assert.equal(auth.token, null);
  assert.equal(identityReads, 0);
  assert.equal(data.has("gamevault_token"), false);
  location.hash = "";
});

test("a cancelled credential attempt cannot store a token or error", async () => {
  const auth = setup(),
    gate = deferred();
  auth.logout();
  authClient.defaults.adapter = async (c) => {
    await gate.promise;
    return response(c, { token: "late-token", user: alice });
  };
  const pending = auth.login(alice.email, "password");
  const outcome = pending.catch(() => {});
  auth.cancelPending();
  gate.release();
  await outcome;
  assert.equal(auth.token, null);
  assert.equal(auth.user, null);
  assert.equal(auth.error, "");
  assert.equal(data.has("gamevault_token"), false);
});
test("a newer login supersedes pending registration and older failure cannot replace current feedback", async () => {
  const auth = setup(),
    gate = deferred();
  authClient.defaults.adapter = async (c) => {
    if (c.url === "/auth/register") {
      await gate.promise;
      throw new AxiosError(
        "old registration failed",
        "ERR_BAD_REQUEST",
        c,
        undefined,
        { ...response(c, { error: "Old registration error" }), status: 409 },
      );
    }
    return response(c, { token: "bob-token", user: bob });
  };
  const pending = auth.register("new@example.invalid", "password");
  const outcome = pending.catch(() => {});
  await auth.login(bob.email, "password");
  gate.release();
  await outcome;
  assert.equal(auth.user?.id, "bob");
  assert.equal(auth.token, "bob-token");
  assert.equal(auth.error, "");
});
test("current Steam exchange verifies the new token before exposing its identity", async () => {
  const auth = setup();
  location.hash = "#steam_code=one-use";
  let reads = 0;
  authClient.defaults.adapter = async (c) => {
    if (c.url === "/auth/steam/exchange")
      return response(c, { token: "steam-token" });
    assert.equal(c.headers.Authorization, "Bearer steam-token");
    assert.equal(auth.user, null);
    reads++;
    return response(c, bob);
  };
  await auth.restore();
  assert.equal(reads, 1);
  assert.equal(auth.user?.id, "bob");
  assert.equal(auth.token, "steam-token");
  assert.equal(data.get("gamevault_token"), "steam-token");
  location.hash = "";
});
