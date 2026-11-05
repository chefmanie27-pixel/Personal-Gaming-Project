import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import {
  useSocialStore,
  socialClient,
  publicGame,
  defaults,
} from "../src/stores/social";
import { useAuthStore } from "../src/stores/auth";
import { createRequestScope } from "../src/utils/requestScope";
Object.defineProperty(globalThis, "localStorage", {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  configurable: true,
});
test("social requests discard a response after sign-out and omit private snapshot fields", async () => {
  setActivePinia(createPinia());
  const auth = useAuthStore(),
    social = useSocialStore();
  auth.user = { id: "alice", email: "alice@example.invalid", role: "USER" };
  auth.token = "alice-token";
  let release!: () => void;
  socialClient.defaults.adapter = async (config) => {
    assert.equal(config.headers.Authorization, "Bearer alice-token");
    await new Promise<void>((r) => (release = r));
    return {
      data: { data: { bio: "private response" } },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  const pending = social.request("/social/me");
  auth.logout();
  await social.connect();
  release();
  await assert.rejects(pending, /session changed/);
  assert.equal(social.me, null);
  assert.equal(social.unread, 0);
  const card = publicGame({
    id: "steam-1",
    slug: "steam-1",
    title: "One",
    cover: "",
    genres: [],
    platforms: [],
    notes: "SECRET",
    description: "PRIVATE",
  } as any);
  assert.doesNotMatch(JSON.stringify(card), /SECRET|PRIVATE|notes/);
  assert.equal(defaults().notifications, true);
});
test("new filter requests invalidate prior results", () => {
  const scope = createRequestScope(),
    old = scope.next();
  assert.ok(old());
  const latest = scope.next();
  assert.ok(!old());
  assert.ok(latest());
  scope.invalidate();
  assert.ok(!latest());
});

test("operation scopes reject changed accounts/resources before watchers and discard disposed continuations", async () => {
  const { createOperationScope } = await import("../src/utils/requestScope");
  let token = "alice-token",
    account = "alice",
    resource = "collection-a";
  const scope = createOperationScope(() => [token, account, resource]);
  const old = scope.next();
  assert.equal(old(), true);
  token = "bob-token";
  account = "bob";
  assert.equal(old(), false);
  const other = scope.next();
  resource = "collection-b";
  assert.equal(other(), false);
  const live = scope.next();
  assert.equal(live(), true);
  scope.dispose();
  assert.equal(live(), false);
  assert.equal(scope.next()(), false);
});
test("a refreshed operation cannot be overwritten by an older completion in the same context", async () => {
  const { createOperationScope } = await import("../src/utils/requestScope");
  const scope = createOperationScope(() => ["same-token", "same-user"]);
  const first = scope.next(),
    second = scope.next();
  let message = "new load";
  if (first()) message = "old mutation";
  assert.equal(message, "new load");
  assert.equal(second(), true);
  scope.invalidate();
  assert.equal(second(), false);
});
