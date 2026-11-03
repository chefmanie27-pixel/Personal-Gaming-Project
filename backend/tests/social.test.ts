import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import {
  profileSchema,
  reviewSchema,
  collectionSchema,
  username,
  artwork,
} from "../src/social.js";
test("social schemas default private, normalize usernames and reject executable artwork and overposting", () => {
  const p = profileSchema.parse({ username: " Player_1 ", name: "Player" });
  assert.equal(p.username, "player_1");
  assert.equal(p.visibility, "private");
  assert.equal(p.shareLibrary, false);
  for (const v of ["admin", "xx", "bad name", "<script>"])
    assert.equal(username.safeParse(v).success, false);
  for (const v of [
    "javascript:alert(1)",
    "http://example.com/a",
    "https://user:pass@example.com",
  ])
    assert.equal(artwork.safeParse(v).success, false);
  assert.equal(
    profileSchema.safeParse({ ...p, userId: "other" }).success,
    false,
  );
  assert.equal(
    reviewSchema.safeParse({
      game: {},
      title: "t",
      body: "b",
      rating: NaN,
      spoiler: false,
    }).success,
    false,
  );
  assert.equal(
    collectionSchema.safeParse({
      name: "n",
      description: "",
      cover: "",
      theme: "",
      visibility: "public",
      games: [],
      collaborator: "other",
    }).success,
    false,
  );
});
test(
  "MySQL social profiles, requests, blocks, publication privacy, revisions, moderation and notifications",
  { skip: process.env.GAMEVAULT_DATABASE_TESTS !== "1" },
  async (t) => {
    const { prisma } = await import("../src/db.js");
    const { createSocialRouter } = await import("../src/social.js");
    const { issueToken } = await import("../src/auth.js");
    const ids: string[] = [];
    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use("/social", createSocialRouter(prisma));
    app.use(
      (
        e: unknown,
        _q: express.Request,
        r: express.Response,
        _n: express.NextFunction,
      ) => {
        console.error(e);
        r.status(500).json({ error: "test server error" });
      },
    );
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = "http://127.0.0.1:" + address.port + "/social";
    const tokens: string[] = [];
    const names: string[] = [];
    const game = {
      id: "steam-440",
      slug: "steam-440",
      title: "Test game",
      cover: "",
      genres: ["Action"],
      platforms: ["PC"],
    };
    let review: any, collection: any;
    async function api(path: string, who = -1, method = "GET", body?: unknown) {
      const r = await fetch(base + path, {
        method,
        headers: {
          ...(who >= 0 ? { Authorization: "Bearer " + tokens[who] } : {}),
          "Content-Type": "application/json",
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, body: await r.json() };
    }
    try {
      for (let i = 0; i < 4; i++) {
        const u = await prisma.user.create({
          data: {
            email: "social-test-" + randomUUID() + "@example.invalid",
            passwordHash: "disabled",
            role: i === 3 ? "ADMIN" : "USER",
          },
        });
        ids.push(u.id);
        tokens.push(issueToken(u));
        names.push("t" + randomUUID().replaceAll("-", "").slice(0, 20));
      }
      await t.test(
        "profiles require ownership, keep private fields out and enforce unique handles/revisions",
        async () => {
          assert.equal((await api("/me")).status, 401);
          for (let i = 0; i < 4; i++)
            assert.equal(
              (
                await api("/me", i, "PUT", {
                  username: names[i],
                  name: "Tester " + i,
                  bio: "bio",
                  visibility: i === 1 ? "private" : "public",
                  shareLibrary: i === 0,
                })
              ).status,
              200,
            );
          assert.equal(
            (
              await api("/me", 2, "PUT", {
                username: names[0],
                name: "Collision",
                version: 0,
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await api("/me", 0, "PUT", {
                username: names[0],
                name: "Stale",
                version: 8,
              })
            ).status,
            409,
          );
          await prisma.libraryEntry.create({
            data: {
              userId: ids[0],
              slug: game.slug,
              game,
              notes: "SECRET PRIVATE NOTE",
              status: "Completed",
            },
          });
          const profile = (await api("/profiles/" + names[0])).body;
          assert.equal(profile.data.library.length, 1);
          assert.doesNotMatch(
            JSON.stringify(profile),
            /SECRET|passwordHash|email/,
          );
          assert.equal(
            (await api("/profiles/" + names[1])).body.data.locked,
            true,
          );
        },
      );
      await t.test(
        "private follow requests need target approval and duplicate/self follows are safe",
        async () => {
          assert.equal(
            (await api("/follow/" + ids[0], 0, "POST", {})).status,
            400,
          );
          assert.equal(
            (await api("/follow/" + ids[1], 0, "POST", {})).body.accepted,
            false,
          );
          await api("/follow/" + ids[1], 0, "POST", {});
          assert.equal(
            await prisma.followEdge.count({
              where: { followerId: ids[0], followedId: ids[1] },
            }),
            1,
          );
          assert.equal(
            (await api("/profiles/" + names[1], 0)).body.data.locked,
            true,
          );
          await api("/requests/" + ids[0], 2, "POST", { accept: true });
          assert.equal(
            (await api("/profiles/" + names[1], 0)).body.data.locked,
            true,
          );
          await api("/requests/" + ids[0], 1, "POST", { accept: true });
          assert.equal(
            (await api("/profiles/" + names[1], 0)).body.data.locked,
            false,
          );
        },
      );
      await t.test(
        "reviews are explicit, revisioned, escaped data with deduplicated likes and reports",
        async () => {
          review = (
            await api("/reviews", 0, "POST", {
              game,
              title: "Review",
              body: "<script>alert(1)</script>",
              rating: 8,
              spoiler: true,
            })
          ).body.data;
          assert.ok(review.id);
          assert.equal(
            (
              await api("/reviews", 0, "POST", {
                game,
                title: "Other",
                body: "Other",
                rating: 9,
                spoiler: false,
              })
            ).body.data.id,
            review.id,
          );
          assert.equal(
            (
              await api("/reviews/" + review.id, 2, "PATCH", {
                game,
                title: "Hijack",
                body: "bad",
                rating: 1,
                spoiler: false,
                version: 0,
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await api("/reviews/" + review.id, 0, "PATCH", {
                game,
                title: "Updated",
                body: "public text",
                rating: 9,
                spoiler: true,
                version: 0,
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await api("/reviews/" + review.id, 0, "PATCH", {
                game,
                title: "Stale",
                body: "old",
                rating: 1,
                spoiler: false,
                version: 0,
              })
            ).status,
            409,
          );
          await api("/reviews/" + review.id + "/like", 2, "POST", {});
          await api("/reviews/" + review.id + "/like", 2, "POST", {});
          assert.equal(
            await prisma.reviewLike.count({ where: { reviewId: review.id } }),
            1,
          );
          await api("/reviews/" + review.id + "/report", 2, "POST", {
            reason: "Test report",
          });
          await api("/reviews/" + review.id + "/report", 2, "POST", {
            reason: "duplicate",
          });
          assert.equal(
            await prisma.reviewReport.count({ where: { reviewId: review.id } }),
            1,
          );
          assert.equal((await api("/moderation/reports", 0)).status, 403);
        },
      );
      await t.test(
        "private authors and blocked users are removed from feed, reviews and direct collection links",
        async () => {
          const privateReview = (
            await api("/reviews", 1, "POST", {
              game,
              title: "Private author",
              body: "restricted",
              rating: 7,
              spoiler: false,
            })
          ).body.data;
          assert.equal(
            (await api("/reviews?slug=" + game.slug)).body.data.some(
              (r: any) => r.id === privateReview.id,
            ),
            false,
          );
          assert.equal(
            (await api("/reviews?slug=" + game.slug, 0)).body.data.some(
              (r: any) => r.id === privateReview.id,
            ),
            true,
          );
          collection = (
            await api("/collections", 0, "POST", {
              name: "Collection",
              description: "Shared",
              cover: "",
              theme: "Action",
              visibility: "private",
              games: [game],
            })
          ).body.data;
          assert.equal(
            (await api("/collections/" + collection.id)).status,
            404,
          );
          collection = (
            await api("/collections/" + collection.id, 0, "PATCH", {
              name: "Collection",
              description: "Shared",
              cover: "",
              theme: "Action",
              visibility: "public",
              games: [game],
              version: 0,
            })
          ).body.data;
          assert.equal(
            (await api("/collections/" + collection.id)).status,
            200,
          );
          await api("/blocks/" + ids[0], 2, "POST", {});
          assert.equal((await api("/profiles/" + names[0], 2)).status, 404);
          assert.equal(
            (await api("/collections/" + collection.id, 2)).status,
            404,
          );
          assert.equal(
            (await api("/reviews/" + review.id + "/like", 2, "POST", {}))
              .status,
            404,
          );
          assert.equal(
            (await api("/reviews", 2)).body.data.some(
              (r: any) => r.userId === ids[0],
            ),
            false,
          );
          assert.equal(
            (await api("/feed", 2)).body.data.some(
              (r: any) => r.userId === ids[0],
            ),
            false,
          );
          assert.equal(
            await prisma.reviewLike.count({
              where: { userId: ids[2], reviewId: review.id },
            }),
            0,
          );
          await api("/blocks/" + ids[0], 2, "DELETE");
          assert.equal((await api("/profiles/" + names[0], 2)).status, 200);
          const feed = (await api("/feed?limit=1")).body;
          assert.ok(feed.data.length <= 1);
          assert.ok(feed.nextCursor);
          const next = (await api("/feed?limit=1&cursor=" + feed.nextCursor))
            .body;
          assert.ok(
            !next.data.some((x: any) =>
              feed.data.some((y: any) => x.id === y.id),
            ),
          );
        },
      );
      await t.test(
        "achievements are verified and notifications are owned, deduplicated and honor preferences",
        async () => {
          const a = (await api("/achievements", 0)).body.data;
          assert.ok(a.find((v: any) => v.key === "first_game").unlockedAt);
          assert.ok(a.find((v: any) => v.key === "first_review").unlockedAt);
          assert.equal(
            a.find((v: any) => v.key === "ten_completed").unlockedAt,
            null,
          );
          await api("/achievements", 0);
          assert.equal(
            await prisma.achievementUnlock.count({
              where: { userId: ids[0], key: "first_game" },
            }),
            1,
          );
          const n = (await api("/notifications", 0)).body;
          assert.ok(n.unread > 0);
          await api("/notifications/read", 2, "POST", { id: n.data[0].id });
          assert.equal((await api("/notifications", 0)).body.unread, n.unread);
          await api("/notifications/read", 0, "POST", {});
          assert.equal((await api("/notifications", 0)).body.unread, 0);
          const p = (await api("/me", 0)).body.data;
          await api("/me", 0, "PUT", {
            ...profileSchema.parse(
              Object.fromEntries(
                Object.entries(p).filter(
                  ([k]) => !["userId", "createdAt", "updatedAt"].includes(k),
                ),
              ),
            ),
            settings: { ...p.settings, notifications: false },
            version: p.version,
          });
          const before = await prisma.socialNotification.count({
            where: { userId: ids[0] },
          });
          await api("/follow/" + ids[0], 2, "POST", {});
          assert.equal(
            await prisma.socialNotification.count({
              where: { userId: ids[0] },
            }),
            before,
          );
        },
      );
      await t.test(
        "library events and public library pagination preserve private notes",
        async () => {
          const { databaseLibrary } =
            await import("../src/libraryRepository.js");
          const { snapshot } = await import("../src/library.js");
          const entry = {
            game: snapshot.parse({
              ...game,
              id: "steam-441",
              slug: "steam-441",
              store: "Steam",
            }),
            status: "Want to Play" as const,
            favorite: false,
            rating: null,
            hours: 0,
            notes: "SECRET hook note",
            addedAt: new Date().toISOString(),
          };
          await databaseLibrary.add(ids[0], entry);
          await databaseLibrary.add(ids[0], entry);
          await databaseLibrary.update(ids[0], "steam-441", {
            status: "Completed",
            favorite: true,
          });
          for (const kind of ["added", "completed", "favorite"])
            assert.equal(
              await prisma.socialActivity.count({
                where: { userId: ids[0], entityId: "steam-441", kind },
              }),
              1,
            );
          for (let i = 0; i < 30; i++)
            await prisma.libraryEntry.create({
              data: {
                userId: ids[0],
                slug: "steam-" + (500 + i),
                game: {
                  ...game,
                  id: "steam-" + (500 + i),
                  slug: "steam-" + (500 + i),
                },
                notes: "SECRET paging note",
              },
            });
          const first = (await api("/profiles/" + names[0])).body.data;
          assert.equal(first.library.length, 24);
          assert.equal(first.libraryTruncated, true);
          assert.equal(first.stats.games, 32);
          assert.equal(first.stats.completed, 2);
          const next = (
            await api("/profiles/" + names[0] + "/library?offset=24")
          ).body;
          assert.equal(next.data.length, 8);
          assert.equal(next.nextOffset, null);
          assert.doesNotMatch(JSON.stringify(next), /SECRET|notes/);
          assert.equal((await api("/users?q=%25")).body.data.length, 0);
        },
      );
      await t.test(
        "collection create retries are idempotent and reject another owner",
        async () => {
          const id = randomUUID(),
            v = {
              id,
              name: "Retry collection",
              description: "",
              cover: "",
              theme: "",
              visibility: "public",
              games: [game],
            };
          const first = await api("/collections", 0, "POST", v),
            retry = await api("/collections", 0, "POST", v);
          assert.equal(first.status, 200);
          assert.equal(retry.body.data.id, first.body.data.id);
          assert.equal(
            await prisma.publishedCollection.count({ where: { id } }),
            1,
          );
          assert.equal((await api("/collections", 2, "POST", v)).status, 409);
        },
      );
      await t.test(
        "unfollowing and blocking revoke accepted private-profile access",
        async () => {
          await api("/follow/" + ids[1], 0, "DELETE");
          assert.equal(
            (await api("/profiles/" + names[1], 0)).body.data.locked,
            true,
          );
          assert.equal(
            (await api("/feed?username=" + names[1], 0)).status,
            404,
          );
          await api("/follow/" + ids[1], 0, "POST", {});
          await api("/requests/" + ids[0], 1, "POST", { accept: true });
          await api("/blocks/" + ids[1], 0, "POST", {});
          assert.equal((await api("/profiles/" + names[1], 0)).status, 404);
          assert.equal(
            await prisma.followEdge.count({
              where: { followerId: ids[0], followedId: ids[1] },
            }),
            0,
          );
        },
      );
      await t.test(
        "collection collaborators require acceptance, obey roles and lose access on revocation",
        async () => {
          const v = {
            name: "Private collaboration",
            description: "Owner content",
            cover: "",
            theme: "RPG",
            visibility: "private",
            games: [game],
          };
          const c = (await api("/collections", 0, "POST", v)).body.data;
          assert.equal((await api("/collections/" + c.id, 2)).status, 404);
          assert.equal(
            (
              await api("/collections/" + c.id + "/members", 2, "POST", {
                username: names[1],
                role: "editor",
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await api("/collections/" + c.id + "/members", 0, "POST", {
                username: names[2],
                role: "viewer",
              })
            ).status,
            200,
          );
          assert.equal((await api("/collections/" + c.id, 2)).status, 404);
          assert.ok(
            (await api("/collaborations", 2)).body.data.some(
              (r: any) => r.collectionId === c.id && !r.accepted,
            ),
          );
          await api("/collections/" + c.id + "/respond", 2, "POST", {
            accept: true,
          });
          assert.equal(
            (await api("/collections/" + c.id, 2)).body.data.permission,
            "viewer",
          );
          assert.equal(
            (
              await api("/collections/" + c.id, 2, "PATCH", {
                ...v,
                name: "Hijack",
                version: 0,
              })
            ).status,
            403,
          );
          await api("/collections/" + c.id + "/members", 0, "POST", {
            username: names[2],
            role: "editor",
          });
          assert.equal((await api("/collections/" + c.id, 2)).status, 404);
          await api("/collections/" + c.id + "/respond", 2, "POST", {
            accept: true,
          });
          assert.equal(
            (await api("/collections/" + c.id, 2)).body.data.permission,
            "editor",
          );
          assert.equal(
            (
              await api("/collections/" + c.id, 2, "PATCH", {
                ...v,
                visibility: "public",
                version: 0,
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await api("/collections/" + c.id, 2, "PATCH", {
                ...v,
                name: "Editor content",
                version: 0,
              })
            ).status,
            200,
          );
          assert.equal(
            (await api("/collections/" + c.id + "?version=1", 2, "DELETE"))
              .status,
            409,
          );
          await api("/collections/" + c.id + "/members/" + ids[2], 0, "DELETE");
          assert.equal((await api("/collections/" + c.id, 2)).status, 404);
          assert.equal(
            (
              await api("/collections/" + c.id, 2, "PATCH", {
                ...v,
                version: 1,
              })
            ).status,
            403,
          );
          assert.ok(
            (await api("/notifications", 2)).body.data.every(
              (r: any) => r.dedupe !== "invite:" + c.id,
            ),
          );
          await api("/collections/" + c.id + "/members", 0, "POST", {
            username: names[2],
            role: "editor",
          });
          await api("/collections/" + c.id + "/respond", 2, "POST", {
            accept: true,
          });
          await api("/blocks/" + ids[0], 2, "POST", {});
          assert.equal((await api("/collections/" + c.id, 2)).status, 404);
          assert.equal(
            await prisma.collectionMember.count({
              where: { collectionId: c.id, userId: ids[2] },
            }),
            0,
          );
          await api("/blocks/" + ids[0], 2, "DELETE");
        },
      );
      await t.test(
        "featured collections require a current administrator and public visibility",
        async () => {
          assert.equal(
            (
              await api(
                "/collections/" + collection.id + "/feature",
                0,
                "POST",
                { featured: true },
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await api(
                "/collections/" + collection.id + "/feature",
                3,
                "POST",
                { featured: true },
              )
            ).status,
            200,
          );
          assert.ok(
            (await api("/collections?featured=true")).body.data.some(
              (c: any) => c.id === collection.id,
            ),
          );
          const privateCollection = (
            await api("/collections", 0, "POST", {
              name: "Private",
              description: "",
              cover: "",
              theme: "",
              visibility: "private",
              games: [],
            })
          ).body.data;
          assert.equal(
            (
              await api(
                "/collections/" + privateCollection.id + "/feature",
                3,
                "POST",
                { featured: true },
              )
            ).status,
            400,
          );
        },
      );
      await t.test(
        "rarity uses public accounts and suggestions never read private library data",
        async () => {
          const a = (await api("/achievements", 0)).body.data;
          const publicProfiles = await prisma.socialProfile.count({
            where: { visibility: "public", userId: { notIn: [ids[1]] } },
          });
          assert.equal(a[0].rarity.population, publicProfiles);
          assert.ok(
            a.every(
              (v: any) =>
                v.rarity.percentage >= 0 && v.rarity.percentage <= 100,
            ),
          );
          const r = await api("/suggestions", 2);
          assert.equal(r.status, 200);
          assert.ok(
            r.body.data.every(
              (p: any) => p.userId !== ids[2] && p.visibility === "public",
            ),
          );
          assert.ok(!r.body.data.some((p: any) => p.userId === ids[1]));
        },
      );
      await t.test(
        "username aliases retain links and prevent handle takeover",
        async () => {
          const p = (await api("/me", 2)).body.data;
          const v = profileSchema.parse(
            Object.fromEntries(
              Object.entries(p).filter(
                ([k]) => !["userId", "createdAt", "updatedAt"].includes(k),
              ),
            ),
          );
          const newName = "r" + randomUUID().replaceAll("-", "").slice(0, 20);
          assert.equal(
            (await api("/me", 2, "PUT", { ...v, username: newName })).status,
            200,
          );
          assert.equal(
            (await api("/profiles/" + names[2])).body.data.username,
            newName,
          );
          const other = (await api("/me", 3)).body.data;
          const o = profileSchema.parse(
            Object.fromEntries(
              Object.entries(other).filter(
                ([k]) => !["userId", "createdAt", "updatedAt"].includes(k),
              ),
            ),
          );
          assert.equal(
            (await api("/me", 3, "PUT", { ...o, username: names[2] })).status,
            409,
          );
        },
      );
      await t.test(
        "moderation hides content and invalidates old revisions",
        async () => {
          const report = (await api("/moderation/reports", 3)).body.data.find(
            (r: any) => r.reviewId === review.id,
          );
          assert.ok(report);
          await api("/moderation/reports/" + report.id, 3, "POST", {
            hide: true,
          });
          assert.equal(
            (await api("/reviews")).body.data.some(
              (r: any) => r.id === review.id,
            ),
            false,
          );
        },
      );
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    }
  },
);
