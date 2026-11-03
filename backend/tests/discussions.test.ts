import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createDiscussionsRouter, threadSchema } from "../src/discussions.js";
import { issueToken } from "../src/auth.js";
const game = {
  id: "steam-440",
  slug: "steam-440",
  title: "Fixture",
  cover: "",
  genres: [],
  platforms: ["PC"],
};
async function server(enabled: boolean) {
  const app = express();
  app.use(express.json());
  app.use(createDiscussionsRouter(enabled));
  app.use(
    (
      e: unknown,
      _q: express.Request,
      r: express.Response,
      _n: express.NextFunction,
    ) => {
      console.error(e instanceof Error ? e.name : "error");
      r.status(500).json({ error: "test failure" });
    },
  );
  const s = app.listen(0);
  await new Promise<void>((r) => s.once("listening", r));
  const a = s.address();
  assert.ok(a && typeof a !== "string");
  return { s, base: "http://127.0.0.1:" + a.port };
}
test("discussion schemas prevent ownership overposting; disabled gate needs no database", async () => {
  assert.equal(
    threadSchema.safeParse({
      game,
      title: "Hello",
      body: "Message",
      spoiler: false,
      userId: "other",
    }).success,
    false,
  );
  assert.equal(
    threadSchema.safeParse({
      game,
      title: "x",
      body: "x".repeat(10001),
      spoiler: false,
    }).success,
    false,
  );
  const { s, base } = await server(false);
  try {
    assert.deepEqual(await (await fetch(base + "/capabilities")).json(), {
      enabled: false,
    });
    assert.equal((await fetch(base + "/")).status, 503);
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
  }
});
test(
  "MySQL discussion privacy, replay safety, stale edits, blocks and audited moderation",
  { skip: process.env.GAMEVAULT_DATABASE_TESTS !== "1" },
  async () => {
    const { prisma } = await import("../src/db.js");
    const { s, base } = await server(true);
    const ids: string[] = [],
      tokens: string[] = [];
    async function api(path: string, who = -1, method = "GET", body?: unknown) {
      const r = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(who >= 0 ? { Authorization: "Bearer " + tokens[who] } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, body: await r.json() };
    }
    try {
      for (let i = 0; i < 3; i++) {
        const u = await prisma.user.create({
          data: {
            email: "discussion-" + randomUUID() + "@example.invalid",
            passwordHash: "disabled",
            role: i === 2 ? "ADMIN" : "USER",
          },
        });
        ids.push(u.id);
        tokens.push(issueToken(u));
        await prisma.socialProfile.create({
          data: {
            userId: u.id,
            username: "d" + randomUUID().replaceAll("-", "").slice(0, 20),
            name: "Fixture " + i,
            bio: "",
            avatar: "",
            banner: "",
            settings: {},
            visibility: i === 0 ? "private" : "public",
          },
        });
      }
      const id = randomUUID(),
        payload = {
          id,
          game,
          title: "Private thread",
          body: "Private discussion only",
          spoiler: true,
        };
      assert.equal((await api("/", -1, "POST", payload)).status, 401);
      assert.equal((await api("/", 0, "POST", payload)).status, 200);
      assert.equal((await api("/", 0, "POST", payload)).body.existing, true);
      assert.equal((await api("/" + id)).status, 404);
      assert.equal((await api("/" + id, 1)).status, 404);
      assert.equal((await api("/?slug=steam-440", 1)).body.data.length, 0);
      await prisma.followEdge.create({
        data: { followerId: ids[1], followedId: ids[0], accepted: true },
      });
      assert.equal((await api("/" + id, 1)).body.data.body, payload.body);
      assert.equal(
        (
          await api("/" + id, 1, "PATCH", {
            title: "Stolen",
            body: "x",
            spoiler: false,
            version: 0,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await api("/" + id, 0, "PATCH", {
            title: "Updated",
            body: "New body",
            spoiler: true,
            version: 0,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await api("/" + id, 0, "PATCH", {
            title: "Stale",
            body: "x",
            spoiler: false,
            version: 0,
          })
        ).status,
        409,
      );
      const rid = randomUUID(),
        reply = { id: rid, body: "Reply", spoiler: true };
      assert.equal(
        (await api("/" + id + "/replies", 1, "POST", reply)).status,
        200,
      );
      assert.equal(
        (await api("/" + id + "/replies", 1, "POST", reply)).body.existing,
        true,
      );
      const replyPath = "/" + id + "/replies/" + rid;
      assert.equal(
        (
          await api(replyPath, 0, "PATCH", {
            body: "Foreign edit",
            spoiler: false,
            version: 0,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await api(replyPath, 1, "PATCH", {
            body: "Edited reply",
            spoiler: false,
            version: 0,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await api(replyPath, 1, "PATCH", {
            body: "Stale reply",
            spoiler: true,
            version: 0,
          })
        ).status,
        409,
      );
      assert.equal(
        (await api("/" + id + "/replies", 1)).body.data[0].body,
        "Edited reply",
      );
      await prisma.blockEdge.create({
        data: { blockerId: ids[0], blockedId: ids[1] },
      });
      assert.equal((await api("/" + id, 1)).status, 404);
      assert.equal(
        (
          await api("/" + id + "/replies", 1, "POST", {
            ...reply,
            id: randomUUID(),
          })
        ).status,
        404,
      );
      await prisma.blockEdge.deleteMany({ where: { blockerId: ids[0] } });
      assert.equal(
        (await api("/" + id + "/replies?limit=1", 1)).body.data[0].spoiler,
        false,
      );
      for (let i = 0; i < 2; i++)
        assert.equal(
          (
            await api("/" + id + "/report", 1, "POST", {
              category: "spoilers",
              reason: "Unmarked content",
              replyId: rid,
            })
          ).status,
          200,
        );
      assert.equal(
        await prisma.discussionReport.count({ where: { threadId: id } }),
        1,
      );
      assert.equal((await api("/moderation/reports", 1)).status, 403);
      const reports = await api("/moderation/reports", 2);
      assert.equal(reports.status, 200);
      const report = reports.body.data.find((r: any) => r.threadId === id);
      assert.ok(report);
      assert.equal(
        (
          await api("/moderation/reports/" + report.id, 2, "POST", {
            hide: true,
            reason: "Reviewed spoiler report",
          })
        ).status,
        200,
      );
      assert.equal((await api("/" + id + "/replies", 1)).body.data.length, 0);
      assert.equal(
        (await api("/moderation/actions", 2)).body.data.some(
          (a: any) => a.targetKey === "reply:" + rid,
        ),
        true,
      );
      // Timestamp ties and insertions between pages must not repeat/skip original rows.
      const pageIds = Array.from({ length: 4 }, () => randomUUID())
        .sort()
        .reverse();
      const tied = new Date("2026-01-01T12:00:00.000Z");
      await prisma.discussionThread.createMany({
        data: pageIds.map((tid) => ({
          id: tid,
          userId: ids[1],
          slug: "steam-442",
          game: { ...game, slug: "steam-442" },
          title: "Page fixture",
          body: "Fixture",
          createdAt: tied,
        })),
      });
      const first = await api("/?slug=steam-442&limit=2", 1);
      assert.deepEqual(
        first.body.data.map((r: any) => r.id),
        pageIds.slice(0, 2),
      );
      assert.ok(first.body.nextCursor);
      await prisma.discussionThread.create({
        data: {
          id: randomUUID(),
          userId: ids[1],
          slug: "steam-442",
          game: { ...game, slug: "steam-442" },
          title: "New after page one",
          body: "Fixture",
        },
      });
      const second = await api(
        "/?slug=steam-442&limit=2&cursor=" +
          encodeURIComponent(first.body.nextCursor),
        1,
      );
      assert.deepEqual(
        second.body.data.map((r: any) => r.id),
        pageIds.slice(2),
      );
      assert.equal(second.body.nextCursor, null);
      const replyIds = Array.from({ length: 4 }, () => randomUUID()).sort();
      await prisma.discussionReply.createMany({
        data: replyIds.map((replyId) => ({
          id: replyId,
          threadId: id,
          userId: ids[1],
          body: "Page reply",
          createdAt: tied,
        })),
      });
      const rp = await api("/" + id + "/replies?limit=2", 1);
      assert.deepEqual(
        rp.body.data.map((r: any) => r.id),
        replyIds.slice(0, 2),
      );
      const rp2 = await api(
        "/" +
          id +
          "/replies?limit=2&cursor=" +
          encodeURIComponent(rp.body.nextCursor),
        1,
      );
      assert.deepEqual(
        rp2.body.data.map((r: any) => r.id),
        replyIds.slice(2),
      );
      assert.equal(rp2.body.nextCursor, null);
      assert.equal((await api("/?cursor=invalid", 1)).status, 400);
      assert.equal((await api("/?limit=31", 1)).status, 400);
      await prisma.user.update({
        where: { id: ids[2] },
        data: { role: "USER" },
      });
      assert.equal((await api("/moderation/actions", 2)).status, 403);
      assert.equal(
        (await api("/" + id + "?version=0", 0, "DELETE")).status,
        409,
      );
      assert.equal(
        (await api("/" + id + "?version=1", 0, "DELETE")).status,
        200,
      );
      assert.equal((await api("/" + id, 0)).status, 404);
    } finally {
      await new Promise<void>((r) => s.close(() => r()));
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    }
  },
);
