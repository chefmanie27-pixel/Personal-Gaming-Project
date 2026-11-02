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
