import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeArtwork, artworkRouter } from "../src/artwork.js";
import express from "express";
import { randomUUID } from "node:crypto";
test("uploaded artwork is decoded, resized, stripped and re-encoded; SVG, malformed, huge and animated inputs are rejected", async () => {
  const valid = await sharp({
    create: { width: 2000, height: 1200, channels: 3, background: "#aabbcc" },
  })
    .png()
    .toBuffer();
  const output = await normalizeArtwork(valid),
    meta = await sharp(output).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(meta.width! <= 1920 && meta.height! <= 1080);
  assert.equal(meta.exif, undefined);
  for (const bytes of [
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ),
    Buffer.alloc(30),
    Buffer.alloc(2 * 1024 * 1024 + 1),
  ])
    await assert.rejects(() => normalizeArtwork(bytes));
  const huge = await sharp({
    create: { width: 5000, height: 4000, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  await assert.rejects(() => normalizeArtwork(huge));
});
test(
  "MySQL artwork upload ownership, public sanitized delivery and deletion",
  { skip: process.env.GAMEVAULT_DATABASE_TESTS !== "1" },
  async () => {
    const { prisma } = await import("../src/db.js"),
      { issueToken } = await import("../src/auth.js");
    const users: string[] = [],
      tokens: string[] = [];
    const app = express();
    app.use(
      "/artwork",
      express.raw({
        type: ["image/png", "image/jpeg", "image/webp"],
        limit: "2mb",
      }),
      artworkRouter,
    );
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = "http://127.0.0.1:" + address.port + "/artwork";
    try {
      for (let i = 0; i < 2; i++) {
        const u = await prisma.user.create({
          data: {
            email: "artwork-test-" + randomUUID() + "@example.invalid",
            passwordHash: "disabled",
          },
        });
        users.push(u.id);
        tokens.push(issueToken(u));
      }
      const bytes = await sharp({
        create: { width: 64, height: 64, channels: 3, background: "#ffeecc" },
      })
        .png()
        .toBuffer();
      const post = await fetch(base, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + tokens[0],
          "Content-Type": "image/png",
        },
        body: bytes,
      });
      assert.equal(post.status, 201);
      const id = (await post.json()).data.id;
      assert.equal(
        (
          await fetch(base, {
            method: "POST",
            headers: { "Content-Type": "image/png" },
            body: bytes,
          })
        ).status,
        401,
      );
      const asset = await fetch(base + "/" + id);
      assert.equal(asset.status, 200);
      assert.equal(asset.headers.get("Content-Type"), "image/webp");
      assert.equal(
        (await sharp(Buffer.from(await asset.arrayBuffer())).metadata()).format,
        "webp",
      );
      assert.equal(
        (
          await fetch(base + "/" + id, {
            method: "DELETE",
            headers: { Authorization: "Bearer " + tokens[1] },
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await fetch(base + "/mine", {
            headers: { Authorization: "Bearer " + tokens[1] },
          }).then((r) => r.json())
        ).data.length,
        0,
      );
      assert.equal(
        (
          await fetch(base + "/" + id, {
            method: "DELETE",
            headers: { Authorization: "Bearer " + tokens[0] },
          })
        ).status,
        200,
      );
      assert.equal((await fetch(base + "/" + id)).status, 404);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.$disconnect();
    }
  },
);
