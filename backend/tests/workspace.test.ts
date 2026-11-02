import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  workspaceSchema,
  createWorkspaceRouter,
  type WorkspaceRepository,
} from "../src/workspace.js";
import { issueToken } from "../src/auth.js";
import { authRateLimit } from "../src/rateLimit.js";
test("workspace validates exact dates, duplicate identifiers and private record ownership fields", () => {
  assert.equal(workspaceSchema.safeParse({}).success, true);
  assert.equal(workspaceSchema.safeParse({ userId: "other" }).success, false);
  assert.equal(
    workspaceSchema.safeParse({
      metadata: {
        "steam-1": {
          completedAt: "2026-02-30",
          priority: "High",
          collectionIds: [],
        },
      },
    }).success,
    false,
  );
  const id = "36ea855e-d323-4a28-8490-3fe029a9f14d";
  assert.equal(
    workspaceSchema.safeParse({
      collections: [
        { id, name: "A" },
        { id, name: "B" },
      ],
    }).success,
    false,
  );
  assert.equal(
    workspaceSchema.safeParse({
      metadata: {
        "steam-1": { completedAt: null, priority: "High", collectionIds: [id] },
      },
    }).success,
    false,
  );
});
test("workspace API isolates users, requires authentication and rejects stale saves", async () => {
  const rows = new Map<
    string,
    { data: ReturnType<typeof workspaceSchema.parse>; version: number }
  >();
  const repo: WorkspaceRepository = {
    async read(user) {
      if (!rows.has(user))
        rows.set(user, { data: workspaceSchema.parse({}), version: 0 });
      return rows.get(user)!;
    },
    async save(user, version, data) {
      const current = rows.get(user);
      if (!current || current.version !== version) return false;
      rows.set(user, { data, version: version + 1 });
      return true;
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/workspace", createWorkspaceRouter(repo));
  app.post("/limited", authRateLimit(2), (_req, res) => res.sendStatus(200));
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  const req = (user: string, body?: unknown) =>
    fetch(base + "/workspace", {
      method: body ? "PUT" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(user
          ? {
              Authorization: "Bearer " + issueToken({ id: user, role: "USER" }),
            }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    assert.equal((await req("")).status, 401);
    await req("alice");
    const data = workspaceSchema.parse({
      profile: { name: "Alice", bio: "Private" },
    });
    assert.equal((await req("alice", { version: 0, data })).status, 200);
    assert.equal((await req("alice", { version: 0, data })).status, 409);
    assert.equal((await (await req("bob")).json()).data.profile.name, "");
    await fetch(base + "/limited", { method: "POST" });
    await fetch(base + "/limited", { method: "POST" });
    const blocked = await fetch(base + "/limited", { method: "POST" });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("Retry-After"));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

import { spawnSync } from "node:child_process";
test("production configuration rejects development defaults and accepts explicit HTTPS configuration", () => {
  const env = { ...process.env, NODE_ENV: "production" };
  delete env.JWT_SECRET;
  delete env.DATABASE_URL;
  delete env.FRONTEND_ORIGIN;
  delete env.PUBLIC_API_ORIGIN;
  const args = [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    "import './src/config.ts'",
  ];
  const rejected = spawnSync(process.execPath, args, {
    env,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Production requires/);
  const accepted = spawnSync(process.execPath, args, {
    env: {
      ...env,
      JWT_SECRET: "test-only-production-configuration-key-123456789",
      DATABASE_URL: "mysql://test:test@localhost:3306/test",
      FRONTEND_ORIGIN: "https://gamevault.example.invalid",
      PUBLIC_API_ORIGIN: "https://api.example.invalid",
    },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(accepted.status, 0, accepted.stderr);
});
