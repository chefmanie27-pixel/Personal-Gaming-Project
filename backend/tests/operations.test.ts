import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  requestContext,
  readiness,
  installShutdown,
  type OperationalEvent,
} from "../src/operations.js";
test("request IDs are generated, logs exclude secrets, readiness fails safely and shutdown closes resources", async () => {
  const events: OperationalEvent[] = [],
    app = express();
  let checks = 0,
    closing = false;
  app.use(requestContext((e) => events.push(e)));
  app.get("/secret", (_q, r) => r.json({ ok: true }));
  app.get(
    "/ready",
    readiness(
      async () => {
        checks++;
        throw Error("mysql://secret:password@private");
      },
      () => closing,
    ),
  );
  const s = app.listen(0);
  await new Promise<void>((r) => s.once("listening", r));
  const a = s.address();
  assert.ok(a && typeof a !== "string");
  const base = "http://127.0.0.1:" + a.port;
  const r = await fetch(base + "/secret?token=PRIVATE", {
    headers: {
      Authorization: "Bearer SECRET",
      "X-Request-ID": "injected-secret",
    },
  });
  assert.match(r.headers.get("x-request-id")!, /^[a-f0-9-]{36}$/);
  await r.json();
  const bad = await fetch(base + "/ready");
  assert.equal(bad.status, 503);
  assert.deepEqual(await bad.json(), { status: "unavailable" });
  await (await fetch(base + "/ready")).json();
  assert.equal(checks, 1);
  closing = true;
  assert.equal((await fetch(base + "/ready")).status, 503);
  const serialized = JSON.stringify(events);
  for (const secret of ["PRIVATE", "SECRET", "token", "password", "injected"])
    assert.equal(serialized.includes(secret), false);
  let stopped = false,
    disconnected = false;
  const lifecycle = installShutdown(
    s,
    () => {
      stopped = true;
    },
    async () => {
      disconnected = true;
    },
    () => false,
    (e) => events.push(e),
  );
  await lifecycle.shutdown();
  assert.equal(lifecycle.isClosing(), true);
  assert.equal(stopped && disconnected, true);
  assert.equal(s.listening, false);
  assert.equal(events.at(-1)?.event, "shutdown-complete");
});
