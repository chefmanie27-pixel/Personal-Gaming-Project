// Isolated browser smoke tests. Uses Edge and deterministic API fixtures; no accounts or real data are changed.
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function port() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const p = server.address().port;
  await new Promise((r) => server.close(r));
  return p;
}
(async () => {
  const apiPort = await port(),
    vitePort = await port(),
    debugPort = await port();
  const art =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#25314f"/></svg>',
    );
  const games = Array.from({ length: 16 }, (_, i) => ({
    id: "steam-" + (100 + i),
    slug: "steam-" + (100 + i),
    title: "Fixture Game " + i,
    tagline: "An adventure to remember",
    description: "Deterministic browser test artwork and game data.",
    cover: art,
    hero: art,
    genres: [i % 2 ? "RPG" : "Action"],
    platforms: ["PC"],
    releaseDate: "2025-01-10",
    developer: "Test Studio",
    publisher: "Test Publisher",
    score: 80 + i,
    reviewCount: "100",
    price: 100 + i,
    store: "Steam",
    storeUrl: "https://store.steampowered.com/app/" + (100 + i) + "/",
    status: "released",
  }));
  const emptyWorkspace = () => ({
    profile: { name: "", bio: "" },
    preferences: { genres: [], platforms: [] },
    collections: [],
    metadata: {},
    journal: [],
    watches: [],
  });
  let accountWorkspace = { data: emptyWorkspace(), version: 0 };
  const accountJournal = new Map();
  let failSummaryYear = null;
  let failNextJournalCreateAfterCommit = false;
  let holdLibraryBulk = false,
    releaseLibraryBulk = null,
    holdJournalWrite = false,
    releaseJournalWrite = null;
  const accountEntries = new Map();
  let bulkRequests = 0;
  let socialProfile = null;
  let holdLogin = false,
    releaseLogin = null;
  let fixtureRole = "USER",
    discussionsEnabled = true,
    omitThreadFromList = false;
  const discussionReports = new Map(),
    discussionActions = [];
  const discussionThreads = new Map(),
    discussionReplies = new Map();
  let failReviewReport = false,
    holdCollectionWrite = false,
    releaseCollectionWrite = null;
  const socialReviews = new Map(),
    socialCollections = new Map();
  const card = () => ({
    userId: "fixture-user",
    username: socialProfile?.username ?? "fixture_player",
    name: socialProfile?.name ?? "Fixture Player",
    avatar: "",
    visibility: "public",
  });
  let historyEnabled = false,
    failHistoryPage = false;
  let holdAlertMutation = false,
    releaseAlertMutation = null,
    holdAlertRead = false,
    releaseAlertRead = null;
  let holdWorkspaceSave = false,
    releaseWorkspaceSave = null;
  let failAlertRead = false;
  const fixtureAlerts = new Map();
  let failAlertAfterCommit = false;
  const savedPrices = new Map();
  let failHistory = false;
  let failScreenshot = false;
  let detailMediaFixture = false, relatedFixture = false, failRelatedSecond = false, holdRelatedEditions = false, releaseRelatedEditions = null;
  let holdWishlist = false, wishlistWrites = 0;
  const wishlistReleases = [];
  let failPrivateExport = false, holdPrivateExport = false, releasePrivateExport = null, privateExportReads = 0;
  let failGames = false;
  let catalogueFilterFixtures = false;
  let cataloguePaged = false, failCataloguePage = null, holdCatalogueSearch = null, releaseCatalogueRead = null;
  let holdCatalogueSource = null;
  let requests = [];
  const api = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (
      req.url.startsWith("/api/discussions") ||
      req.url.startsWith("/api/artwork") ||
      req.url.startsWith("/api/social") ||
      req.url.startsWith("/api/steam-library")
    ) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const v = raw ? JSON.parse(raw) : {},
          u = new URL(req.url, "http://localhost"),
          p = u.pathname,
          m = req.method;
        requests.push(p + u.search);
        let result = { data: [], nextCursor: null, nextOffset: null };
        if (p === "/api/discussions/capabilities")
          result = { enabled: discussionsEnabled };
        else if (p === "/api/discussions") {
          if (m === "POST") {
            discussionThreads.set(v.id, {
              ...v,
              userId: "fixture-user",
              slug: v.game.slug,
              version: 0,
              createdAt: new Date().toISOString(),
              author: card(),
            });
            result = { data: discussionThreads.get(v.id) };
          } else
            result = {
              data: omitThreadFromList ? [] : [...discussionThreads.values()],
              nextCursor: null,
            };
        } else if (p === "/api/discussions/moderation/reports") {
          result = {
            data: [...discussionReports.values()]
              .filter((r) => r.status === "open")
              .map((r) => ({
                ...r,
                thread: discussionThreads.get(r.threadId),
                reply: discussionReplies.get(r.replyId),
              })),
            nextCursor: null,
          };
        } else if (p === "/api/discussions/moderation/actions") {
          result = { data: discussionActions, nextCursor: null };
        } else if (p.startsWith("/api/discussions/moderation/reports/")) {
          const r = discussionReports.get(p.split("/").pop());
          r.status = "resolved";
          if (v.hide) {
            if (r.replyId) discussionReplies.delete(r.replyId);
            else discussionThreads.delete(r.threadId);
          }
          discussionActions.unshift({
            id: "action-" + discussionActions.length,
            ...v,
            action: v.hide ? "hide" : "dismiss",
            targetKey: r.replyId
              ? "reply:" + r.replyId
              : "thread:" + r.threadId,
            createdAt: new Date().toISOString(),
          });
          result = { success: true };
        } else if (p.startsWith("/api/discussions/")) {
          const id = p.split("/")[3];
          if (p.includes("/replies/")) {
            const rid = p.split("/")[5],
              old = discussionReplies.get(rid);
            if (m === "PATCH") {
              if (v.version !== old.version) {
                res.statusCode = 409;
                res.end(
                  JSON.stringify({ error: "Reply changed or is unavailable." }),
                );
                return;
              }
              discussionReplies.set(rid, {
                ...old,
                ...v,
                version: old.version + 1,
              });
              result = { data: discussionReplies.get(rid) };
            } else if (m === "DELETE") {
              discussionReplies.delete(rid);
              result = { success: true };
            }
          } else if (p.endsWith("/replies")) {
            if (m === "POST")
              discussionReplies.set(v.id, {
                ...v,
                userId: "fixture-user",
                threadId: id,
                version: 0,
                createdAt: new Date().toISOString(),
                author: card(),
              });
            result = {
              data:
                m === "POST"
                  ? discussionReplies.get(v.id)
                  : [...discussionReplies.values()].filter(
                      (r) => r.threadId === id,
                    ),
              nextCursor: null,
            };
          } else if (p.endsWith("/report")) {
            const reportId = "report-" + (v.replyId ?? id);
            discussionReports.set(reportId, {
              id: reportId,
              threadId: id,
              ...v,
              status: "open",
              createdAt: new Date().toISOString(),
            });
            result = { success: true };
          } else if (m === "PATCH") {
            discussionThreads.set(id, {
              ...discussionThreads.get(id),
              ...v,
              version: v.version + 1,
            });
            result = { data: discussionThreads.get(id) };
          } else if (m === "DELETE") {
            discussionThreads.delete(id);
            result = { success: true };
          } else if (m === "GET") {
            const thread = discussionThreads.get(id);
            if (!thread) {
              res.statusCode = 404;
              result = { error: "Discussion unavailable." };
            } else result = { data: thread };
          }
        } else if (p === "/api/social/me") {
          if (m === "PUT")
            socialProfile = {
              ...v,
              userId: "fixture-user",
              version: (socialProfile?.version ?? -1) + 1,
            };
          result = { data: socialProfile };
        } else if (p === "/api/steam-library")
          result = { data: null, configured: false };
        else if (p === "/api/social/achievements")
          result = {
            data: [
              {
                key: "first_game",
                name: "First Game Added",
                progress: 1,
                target: 1,
                unlockedAt: new Date().toISOString(),
              },
            ],
          };
        else if (p === "/api/social/notifications")
          result = {
            data: [
              {
                id: "notif-1",
                message: "Achievement unlocked: First Game Added",
                kind: "achievement",
                createdAt: new Date().toISOString(),
                readAt: null,
              },
            ],
            unread: 1,
            nextCursor: null,
          };
        else if (p === "/api/social/users")
          result = { data: [card()], nextOffset: null };
        else if (p.startsWith("/api/social/profiles/"))
          result = {
            data: {
              ...card(),
              ...socialProfile,
              locked: false,
              relationship: "none",
              followers: 0,
              following: 0,
              library: [...accountEntries.values()].map((e) => ({
                game: e.game,
                status: e.status,
                favorite: e.favorite,
              })),
              achievements: [],
            },
          };
        else if (p === "/api/social/reviews") {
          if (m === "POST") {
            const old = [...socialReviews.values()].find(
              (r) => r.slug === v.game.slug && r.userId === "fixture-user",
            );
            if (old) result = { data: old, existing: true };
            else {
              const r = {
                ...v,
                id: "review-" + socialReviews.size,
                userId: "fixture-user",
                slug: v.game.slug,
                author: card(),
                likes: 0,
                liked: false,
                createdAt: new Date().toISOString(),
              };
              socialReviews.set(r.id, r);
              result = { data: r };
            }
          } else
            result = { data: [...socialReviews.values()], nextOffset: null };
        } else if (p.startsWith("/api/social/reviews/")) {
          const id = p.split("/")[4],
            r = socialReviews.get(id);
          if (p.endsWith("/report")) {
            if (failReviewReport) {
              res.statusCode = 503;
              res.end(JSON.stringify({ error: "Report service unavailable" }));
              return;
            }
            result = { success: true };
          } else if (p.endsWith("/like")) {
            r.liked = m === "POST";
            r.likes = r.liked ? 1 : 0;
          } else if (m === "PATCH") {
            if (!r || v.version !== r.version) {
              res.statusCode = 409;
              res.end(
                JSON.stringify({ error: "Review changed or unavailable" }),
              );
              return;
            }
            socialReviews.set(id, { ...r, ...v, version: r.version + 1 });
          } else if (m === "DELETE") socialReviews.delete(id);
          result = { data: socialReviews.get(id) };
        } else if (p === "/api/social/collections") {
          if (m === "POST") {
            const c = {
              ...v,
              id: "collection-" + socialCollections.size,
              userId: "fixture-user",
              author: card(),
              followers: 0,
              followed: false,
            };
            socialCollections.set(c.id, c);
            result = { data: c };
          } else
            result = {
              data: [...socialCollections.values()],
              nextCursor: null,
            };
        } else if (p.startsWith("/api/social/collections/")) {
          const id = p.split("/")[4];
          if (m === "PATCH") {
            const old = socialCollections.get(id);
            if (!old || v.version !== old.version) {
              res.statusCode = 409;
              res.end(
                JSON.stringify({ error: "Collection changed or unavailable" }),
              );
              return;
            }
            socialCollections.set(id, {
              ...old,
              ...v,
              version: old.version + 1,
            });
          } else if (m === "DELETE") socialCollections.delete(id);
          result = { data: socialCollections.get(id) };
        }
        if (
          holdCollectionWrite &&
          ["POST", "PATCH"].includes(m) &&
          (p === "/api/social/collections" ||
            (p.startsWith("/api/social/collections/") &&
              p.split("/").length === 5))
        ) {
          releaseCollectionWrite = () => res.end(JSON.stringify(result));
          return;
        }
        res.end(JSON.stringify(result));
      });
      return;
    }
    if (
      req.url === "/api/wishlist" ||
      req.url.startsWith("/api/journal") ||
      req.url.startsWith("/api/workspace") ||
      req.url.startsWith("/api/alerts") ||
      req.url.startsWith("/api/library") ||
      req.url.startsWith("/api/auth/")
    ) {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const input = raw ? JSON.parse(raw) : null;
        let result;
        const journalUrl = new URL(req.url, "http://localhost");
        if (req.url === "/api/wishlist") {
          wishlistWrites++;
          result = { data: input };
          if (holdWishlist) { wishlistReleases.push(() => res.end(JSON.stringify(result))); return; }
        } else if (req.url.startsWith("/api/journal")) {
          const target = journalUrl.pathname;
          if (target === "/api/journal/summary") {
            const year = journalUrl.searchParams.get("year");
            if (Number(year) === failSummaryYear) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Summary unavailable" }));
              return;
            }
            const records = [...accountJournal.values()].filter((e) =>
              e.date.startsWith(year + "-"),
            );
            const monthly = Array(12).fill(0),
              genres = new Map(),
              played = new Map();
            let minutes = 0,
              highestRated = null;
            for (const entry of records) {
              if (entry.kind === "session") {
                minutes += entry.minutes;
                monthly[Number(entry.date.slice(5, 7)) - 1] += entry.minutes;
                const old = played.get(entry.game.slug);
                played.set(entry.game.slug, {
                  game: entry.game,
                  minutes: (old?.minutes ?? 0) + entry.minutes,
                });
                for (const genre of entry.game.genres)
                  genres.set(genre, (genres.get(genre) ?? 0) + entry.minutes);
              } else if (
                entry.rating !== null &&
                (!highestRated || entry.rating > highestRated.rating)
              )
                highestRated = { game: entry.game, rating: entry.rating };
            }
            result = {
              data: {
                days: Object.fromEntries(
                  [
                    ...new Set(
                      records
                        .filter((e) => e.kind === "session")
                        .map((e) => e.date),
                    ),
                  ].map((date) => [
                    date,
                    {
                      minutes: records
                        .filter((e) => e.kind === "session" && e.date === date)
                        .reduce((s, e) => s + e.minutes, 0),
                      sessions: records.filter(
                        (e) => e.kind === "session" && e.date === date,
                      ).length,
                    },
                  ]),
                ),
                minutes,
                monthly,
                genres: [...genres],
                highestRated,
                mostPlayed:
                  [...played.values()].sort(
                    (a, b) => b.minutes - a.minutes,
                  )[0] ?? null,
              },
            };
          } else if (target === "/api/journal/import") {
            for (const entry of input.entries)
              if (!accountJournal.has(entry.id))
                accountJournal.set(entry.id, { ...entry, version: 0 });
            result = { success: true };
          } else if (target === "/api/journal" && req.method === "GET") {
            const q = (journalUrl.searchParams.get("q") ?? "").toLowerCase(),
              kind = journalUrl.searchParams.get("kind"),
              cursor = JSON.parse(
                journalUrl.searchParams.get("cursor") ?? "null",
              ),
              limit = Number(journalUrl.searchParams.get("limit") ?? 24);
            const records = [...accountJournal.values()]
              .filter(
                (e) =>
                  (!kind || e.kind === kind) &&
                  [e.game.title, e.notes, e.progress, e.date]
                    .join(" ")
                    .toLowerCase()
                    .includes(q) &&
                  (!cursor ||
                    e.date < cursor.date ||
                    (e.date === cursor.date && e.id < cursor.id)),
              )
              .sort(
                (a, b) =>
                  b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
              );
            const data = records.slice(0, limit),
              last = data[data.length - 1];
            result = {
              data,
              meta: {
                hasMore: records.length > limit,
                nextCursor:
                  records.length > limit
                    ? { date: last.date, id: last.id }
                    : null,
              },
            };
          } else if (target === "/api/journal" && req.method === "POST") {
            if (!accountJournal.has(input.id))
              accountJournal.set(input.id, { ...input, version: 0 });
            if (failNextJournalCreateAfterCommit) {
              failNextJournalCreateAfterCommit = false;
              res.statusCode = 503;
              res.end(
                JSON.stringify({
                  error: "Simulated response failure after commit",
                }),
              );
              return;
            }
            result = { data: accountJournal.get(input.id) };
          } else {
            const id = target.split("/").pop(),
              old = accountJournal.get(id),
              version =
                req.method === "DELETE"
                  ? Number(journalUrl.searchParams.get("version"))
                  : input.version;
            if (old && old.version !== version) {
              res.statusCode = 409;
              res.end(JSON.stringify({ error: "Entry conflict" }));
              return;
            }
            if (req.method === "PATCH") {
              accountJournal.set(id, { ...input.entry, version: version + 1 });
              result = { data: accountJournal.get(id) };
            } else {
              accountJournal.delete(id);
              result = {};
            }
          }
        } else if (req.url === "/api/alerts/capabilities") {
          result = { history: historyEnabled };
        } else if (req.url.startsWith("/api/alerts/deliveries")) {
          if (failHistoryPage) {
            res.statusCode = 503;
            result = { error: "History fixture unavailable" };
          } else {
            const more = new URL(req.url, "http://localhost").searchParams.has(
              "cursor",
            );
            result = {
              data: [
                {
                  id: more ? "event-2" : "event-1",
                  alertId: "alert-0",
                  slug: "steam-100",
                  title: more
                    ? "Earlier matched game"
                    : "Delivered fixture game",
                  amount: "80.00",
                  currency: "ZAR",
                  mode: "target",
                  outcome: more ? "disabled" : "delivered",
                  observedAt: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                },
              ],
              nextCursor: more ? null : "page-two",
            };
          }
        } else if (req.url === "/api/alerts") {
          if (req.method === "POST") {
            const key = input.gameSlug + ":" + input.target,
              existing = fixtureAlerts.has(key);
            if (!existing)
              fixtureAlerts.set(key, {
                id: "alert-" + fixtureAlerts.size,
                target: String(input.target),
                currency: "ZAR",
                active: true,
                listing: {
                  game: games.find((g) => g.slug === input.gameSlug),
                  store: { name: "Steam" },
                  prices: [],
                },
              });
            if (failAlertAfterCommit) {
              failAlertAfterCommit = false;
              res.statusCode = 503;
              res.end(
                JSON.stringify({
                  error: "Simulated response failure after alert commit",
                }),
              );
              return;
            }
            res.statusCode = existing ? 200 : 201;
            result = { data: fixtureAlerts.get(key), existing };
          } else {
            if (failAlertRead) {
              res.statusCode = 503;
              result = { error: "Alert list unavailable" };
            } else result = { data: [...fixtureAlerts.values()] };
            if (holdAlertRead) {
              releaseAlertRead = () => res.end(JSON.stringify(result));
              return;
            }
          }
        } else if (req.url.startsWith("/api/alerts/")) {
          const id = req.url.split("/").pop(),
            entry = [...fixtureAlerts].find(([, a]) => a.id === id);
          if (!entry) {
            res.statusCode = 404;
            result = { error: "Alert not found" };
          } else if (req.method === "DELETE") {
            fixtureAlerts.delete(entry[0]);
            res.statusCode = 204;
          } else {
            Object.assign(entry[1], input);
            res.statusCode = 204;
          }
          if (holdAlertMutation) {
            releaseAlertMutation = () => res.end();
            return;
          }
        } else if (req.url === "/api/workspace") {
          if (req.method === "PUT") {
            if (input.version !== accountWorkspace.version) {
              res.statusCode = 409;
              res.end(JSON.stringify({ error: "Conflict" }));
              return;
            }
            accountWorkspace = { data: input.data, version: input.version + 1 };
          }
          result = { ...accountWorkspace, journalMode: "normalized" };
          if (req.method === "PUT" && holdWorkspaceSave) {
            releaseWorkspaceSave = () => res.end(JSON.stringify(result));
            return;
          }
        } else if (req.url === "/api/auth/login") {
          result = {
            data: {
              token: "fixture-account-token",
              user: {
                id: "fixture-user",
                email: "fixture@example.invalid",
                role: fixtureRole,
              },
            },
          };
          if (holdLogin) {
            releaseLogin = () => res.end(JSON.stringify(result));
            return;
          }
        } else if (req.url === "/api/auth/me")
          result = {
            data: {
              id: "fixture-user",
              email: "fixture@example.invalid",
              role: fixtureRole,
            },
          };
        else if (req.url === "/api/library/bulk-status") {
          bulkRequests++;
          if (input.slugs.some((slug) => !accountEntries.has(slug))) {
            res.statusCode = 404;
            result = { error: "Missing selected game" };
          } else {
            for (const slug of input.slugs)
              accountEntries.set(slug, {
                ...accountEntries.get(slug),
                status: input.status,
              });
            result = {
              data: input.slugs.map((slug) => accountEntries.get(slug)),
            };
          }
        } else if (req.url === "/api/library/import") {
          for (const entry of input.entries)
            if (!accountEntries.has(entry.game.slug))
              accountEntries.set(entry.game.slug, entry);
          result = { success: true };
        } else if (req.url === "/api/library")
          result = { data: [...accountEntries.values()] };
        else {
          const slug = decodeURIComponent(req.url.split("/").pop());
          if (req.method === "PUT" && !accountEntries.has(slug))
            accountEntries.set(slug, input);
          if (req.method === "PATCH")
            accountEntries.set(slug, { ...accountEntries.get(slug), ...input });
          if (req.method === "DELETE") accountEntries.delete(slug);
          result = { data: accountEntries.get(slug) };
        }
        if (holdLibraryBulk && req.url === "/api/library/bulk-status") {
          releaseLibraryBulk = () => res.end(JSON.stringify(result));
          return;
        }
        if (
          holdJournalWrite &&
          req.url.startsWith("/api/journal") &&
          ["POST", "PATCH"].includes(req.method)
        ) {
          releaseJournalWrite = () => res.end(JSON.stringify(result));
          return;
        }
        res.end(JSON.stringify(result));
      });
      return;
    }
    const url = new URL(req.url, "http://localhost");
    requests.push(url.pathname + url.search);
    let body;
    if (url.pathname === "/api/private-export") {
      privateExportReads++;
      const { journal: embedded, ...metadata } = accountWorkspace.data;
      if (failPrivateExport) { res.statusCode = 503; body = { error: "Export fixture unavailable. Please retry." }; }
      else body = { format: "gamevault-private-data", formatVersion: 1, exportedAt: new Date().toISOString(), source: { kind: "account", journalMode: "normalized" }, consistency: { kind: "transaction-snapshot", workspaceVersion: accountWorkspace.version }, data: { library: [...accountEntries.values()], workspace: metadata, journal: [...accountJournal.values()] } };
      if (holdPrivateExport) { releasePrivateExport = () => res.end(JSON.stringify(body)); return; }
      res.end(JSON.stringify(body)); return;
    }
    if (url.pathname === "/fixture-screenshot.svg") {
      res.setHeader("Cache-Control", "no-store");
      if (failScreenshot) { res.statusCode = 503; res.end("Screenshot unavailable"); }
      else { res.setHeader("Content-Type", "image/svg+xml"); res.end(decodeURIComponent(art.slice(art.indexOf(",") + 1))); }
      return;
    }
    if (url.pathname === "/api/sources")
      body = {
        data: [
          {
            id: "steam",
            name: "Steam",
            available: true,
            platforms: ["PC"],
            genres: true,
            scores: true,
            prices: true,
            note: "Test feed",
            url: "https://store.steampowered.com",
          },
          { id: "epic", name: "Epic Games Store", available: true, platforms: ["PC"], genres: false, scores: false, prices: true, note: "Epic fixture without scores or genres", url: "https://store.epicgames.com" },
          { id: "xbox", name: "Xbox Console", available: true, platforms: ["Xbox"], genres: true, scores: false, prices: true, note: "Xbox fixture", url: "https://www.xbox.com" },
          { id: "rawg", name: "PC and consoles via RAWG", available: true, platforms: ["PC", "Xbox"], genres: true, scores: true, prices: false, note: "Metadata fixture only; no real API key", url: "https://rawg.io" },
        ],
      };
    else if (url.pathname === "/api/games") {
      if (failGames || (cataloguePaged && Number(url.searchParams.get("page") || 1) === failCataloguePage)) {
        res.statusCode = 502;
        body = { error: "Test storefront unavailable" };
      } else {
        const query = (url.searchParams.get("search") ?? "").toLowerCase();
        const genre = url.searchParams.get("genre");
        const source = url.searchParams.get("source") || "steam";
        const names = { epic: "Epic Games Store", xbox: "Xbox Console", rawg: "RAWG" };
        const sourceGames = source === "steam" ? games : games.map(g => ({ ...g, id: source + "-" + g.id, slug: source + "-" + g.slug, title: names[source] + " " + g.title, store: names[source], storeUrl: "https://example.invalid/" + source, platforms: [source === "xbox" ? "Xbox" : "PC"], genres: source === "epic" ? [] : g.genres, score: source === "rawg" ? g.score : null, price: source === "rawg" ? null : g.price }));
        const data = sourceGames.map(g => catalogueFilterFixtures && g.id === "steam-100" ? { ...g, price: 0, score: null } : g).filter(
          (g) =>
            g.title.toLowerCase().includes(query) &&
            (!genre || g.genres.includes(genre)) &&
            (!url.searchParams.has("minScore") || (g.score !== null && g.score >= Number(url.searchParams.get("minScore")))) &&
            (!url.searchParams.has("maxPrice") || (g.price !== null && g.price <= Number(url.searchParams.get("maxPrice")))) &&
            (!url.searchParams.get("platform") || g.platforms.includes(url.searchParams.get("platform"))),
        );
        const page = cataloguePaged ? Number(url.searchParams.get("page") || 1) : 1;
        const pageSize = cataloguePaged ? 8 : Math.max(1, data.length);
        const rows = data.slice((page - 1) * pageSize, page * pageSize);
        if (cataloguePaged && page > 1 && data[(page - 1) * pageSize - 1]) rows.unshift(data[(page - 1) * pageSize - 1]);
        body = {
          data: rows,
          meta: {
            total: data.length,
            page,
            pages: Math.ceil(data.length / pageSize),
            limit: pageSize,
            hasMore: page * pageSize < data.length,
            scope: source === "steam" ? "Test feed" : names[source] + " test feed",
          },
        };
      }
    } else if (/\/related$/.test(url.pathname)) {
      const kind = url.searchParams.get("kind") || "editions", page = Number(url.searchParams.get("page") || 1);
      if (relatedFixture && kind === "editions" && page === 2 && failRelatedSecond) {
        res.statusCode = 503; body = { error: "Related page unavailable" };
      } else {
        const product = id => ({ id: kind + "-" + id, title: kind === "dlc" ? "Fixture expansion" : "Fixture edition " + id, kind: kind === "dlc" ? "dlc" : "edition", url: games[0].storeUrl });
        body = { data: !relatedFixture ? [] : kind === "dlc" ? [product(1)] : page === 1 ? [product(1), product(2)] : [product(2), product(3)], meta: { page, supported: relatedFixture, partial: relatedFixture && kind === "editions" && page === 1, hasMore: relatedFixture && kind === "editions" && page === 1, storeUrl: games[0].storeUrl } };
      }
      if (relatedFixture && holdRelatedEditions && kind === "editions" && page === 1) { releaseRelatedEditions = () => res.end(JSON.stringify(body)); return; }
    }
    else if (url.pathname.endsWith("/observe")) {
      const slug = url.pathname.split("/")[3];
      if (!savedPrices.has(slug))
        savedPrices.set(slug, [
          {
            amount: 100,
            observedAt: new Date().toISOString(),
            sourceType: "steam",
          },
        ]);
      body = {
        data: {
          gameSlug: slug,
          listingId: "fixture-listing",
          recorded: true,
          priceAvailable: true,
          region: "ZA",
          currency: "ZAR",
        },
      };
    } else if (url.pathname.endsWith("/price-history")) {
      if (failHistory) {
        res.statusCode = 502;
        body = { error: "Fixture outage" };
      } else
        body = {
          data: savedPrices.get(url.pathname.split("/")[3]) ?? [],
          meta: {
            sourceType: "observed",
            currency: "ZAR",
            region: "ZA",
            coverage: "Fixture genuine observations",
          },
        };
    } else if (url.pathname.startsWith("/api/games/"))
      body = {
        data: {
          ...(games.find((g) => g.slug === url.pathname.split("/").pop()) ?? games[0]),
          ...(detailMediaFixture ? { screenshots: ["http://127.0.0.1:" + apiPort + "/fixture-screenshot.svg"], trailers: [{ name: "Fixture gameplay trailer", url: "data:video/mp4;base64,AAAA", poster: art }], systemRequirements: [{ platform: "Windows", minimum: "8 GB RAM\n<b>Literal requirement text</b>", recommended: null }] } : {}),
        },
      };
    else if (url.pathname === "/api/deals") {
      const source = url.searchParams.get("source") ?? "all";
      const cursor = JSON.parse(url.searchParams.get("cursor") ?? "{}");
      const page = cursor.steam ?? 1;
      const budget = url.searchParams.has("budget")
        ? Number(url.searchParams.get("budget"))
        : Infinity;
      body = {
        data: games
          .slice(page === 1 ? 0 : 4, page === 1 ? 4 : 8)
          .map((g) => ({
            ...g,
            slug: source === "gog" ? g.slug.replace("steam", "gog") : g.slug,
            store: source === "gog" ? "GOG" : "Steam",
            originalPrice: 200,
          }))
          .filter((g) => g.price <= budget),
        meta: {
          currency: "ZAR",
          sourceType: source,
          hasMore: page === 1,
          nextCursor: { steam: page === 1 ? 2 : 0 },
          sources: [
            {
              id: "steam",
              name: "Steam",
              page,
              hasMore: page === 1,
              scope: "Fixture sale pages",
              error: null,
            },
          ],
          partial: false,
          updatedAt: new Date().toISOString(),
        },
      };
    } else if (url.pathname === "/api/upcoming") {
      body = {
        data: games.slice(8, 12).map((g, i) => ({
          ...g,
          status: "upcoming",
          releaseDate: i === 0 ? "2027-01-15" : "Coming soon",
        })),
        meta: { hasMore: false },
      };
    } else if (url.pathname === "/api/subscriptions") body = { data: [] };
    else body = { data: [] };
    if (url.pathname === "/api/games" && holdCatalogueSearch !== null && (holdCatalogueSource === null || url.searchParams.get("source") === holdCatalogueSource) && (url.searchParams.get("search") ?? "") === holdCatalogueSearch) {
      releaseCatalogueRead = () => res.end(JSON.stringify(body));
      return;
    }
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => api.listen(apiPort, "127.0.0.1", r));
  const vite = spawn(
    process.execPath,
    [
      path.resolve(__dirname, "../../node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(vitePort),
      "--strictPort",
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        VITE_API_URL: "http://127.0.0.1:" + apiPort + "/api",
      },
      windowsHide: true,
      stdio: "ignore",
    },
  );
  const edgePath =
    process.env.EDGE_PATH ??
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gamevault-ui-smoke-"));
  const edge = spawn(
    edgePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--remote-debugging-port=" + debugPort,
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  let ws;
  let id = 0;
  const pending = new Map();
  const errors = [];
  async function waitFor(fn, label) {
    for (let i = 0; i < 300; i++) {
      try {
        if (await fn()) return;
      } catch {}
      await delay(100);
    }
    throw new Error("Timed out: " + label);
  }
  async function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const n = ++id;
      const timeout = setTimeout(() => {
        pending.delete(n);
        reject(new Error("CDP timeout " + method));
      }, 10000);
      pending.set(n, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject,
      });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  }
  async function evaluate(expression) {
    const r = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  const origin = "http://127.0.0.1:" + vitePort;
  let navigationId = 0;
  async function navigate(route, selector) {
    const marker = String(++navigationId);
    await evaluate("window.__gamevaultSmokeDocument=" + JSON.stringify(marker));
    await cdp("Page.navigate", { url: origin + route });
    await waitFor(
      () =>
        evaluate(
          "window.__gamevaultSmokeDocument!==" +
            JSON.stringify(marker) +
            "&&location.href===" +
            JSON.stringify(new URL(route, origin).href) +
            "&&document.readyState==='complete'&&!!document.querySelector(" +
            JSON.stringify(selector) +
            ")",
        ),
      route,
    );
  }

  async function editorLayout(label) {
    for (const width of [320, 375, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      await delay(50);
      const size = await evaluate(
        "({width:innerWidth,scroll:document.documentElement.scrollWidth})",
      );
      assert.ok(
        size.scroll <= size.width + 1,
        label + " overflow at " + width + ": " + JSON.stringify(size),
      );
    }
  }
  try {
    await waitFor(async () => (await fetch(origin)).ok, "Vite");
    let pages;
    await waitFor(async () => {
      pages = await (
        await fetch("http://127.0.0.1:" + debugPort + "/json/list")
      ).json();
      return pages.some((p) => p.type === "page");
    }, "Edge");
    ws = new WebSocket(
      pages.find((p) => p.type === "page").webSocketDebuggerUrl,
    );
    ws.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const p = pending.get(data.id);
        pending.delete(data.id);
        data.error
          ? p.reject(new Error(data.error.message))
          : p.resolve(data.result);
      }
      if (data.method === "Runtime.exceptionThrown")
        errors.push(JSON.stringify(data.params.exceptionDetails));
    });
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    await cdp("Runtime.enable");
    await navigate("/", ".hero-actions .button.primary");
    const actionContrast = await evaluate(
      '(async()=>{const root=document.documentElement,accent=root.dataset.accent,reduced=root.classList.contains("reduce-motion"),canvas=document.createElement("canvas");canvas.width=canvas.height=1;const ctx=canvas.getContext("2d");const luminance=(color)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{const c=v/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;});return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;};const rows=[];try{root.classList.add("reduce-motion");for(const theme of ["violet","cyan","rose","amber"]){root.dataset.accent=theme;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const style=getComputedStyle(document.querySelector(".hero-actions .button.primary")),fg=luminance(style.color),bg=luminance(style.backgroundColor);rows.push({theme,ratio:(Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05)});}return rows;}finally{if(accent===undefined)delete root.dataset.accent;else root.dataset.accent=accent;if(!reduced)root.classList.remove("reduce-motion");}})()',
    );
    for (const row of actionContrast)
      assert.ok(
        row.ratio >= 4.5,
        "primary action contrast " + JSON.stringify(row),
      );

    console.log(
      "Primary action contrast: " +
        JSON.stringify(
          actionContrast.map((row) => ({
            theme: row.theme,
            ratio: Number(row.ratio.toFixed(2)),
          })),
        ),
    );
    games[0].cover = "";
    games[0].coverFallback = art;
    await navigate("/catalogue", ".game-card");
    assert.equal(
      await evaluate(
        '!!document.querySelector(".game-card").querySelector(".cover-wrap > img")',
      ),
      true,
      "empty primary cover must use supplied fallback",
    );
    await evaluate(
      'document.querySelector(".game-card .cover-wrap > img").dispatchEvent(new Event("error"))',
    );
    await waitFor(
      () =>
        evaluate('!!document.querySelector(".game-card .cover-placeholder")'),
      "failed fallback shows placeholder",
    );
    games[0].cover = art;
    delete games[0].coverFallback;

    await navigate("/", ".hero h1");
    assert.equal(
      await evaluate('document.querySelector(".hero h1").textContent'),
      "Fixture Game 0",
    );
    await evaluate('document.querySelector(".hero-actions button").click()');
    assert.equal(
      await evaluate(
        'JSON.parse(localStorage.getItem("gamevault_library_v1")).length',
      ),
      1,
    );
    await navigate("/games/steam-100", ".collection-controls select");
    await evaluate(
      'const s=document.querySelector(".collection-controls select");s.value="Completed";s.dispatchEvent(new Event("change",{bubbles:true}));const n=document.querySelector(".notes-label textarea");n.value="Remember this adventure";n.dispatchEvent(new Event("change",{bubbles:true}));const inputs=document.querySelectorAll(".journal-grid input");inputs[0].value="8.5";inputs[0].dispatchEvent(new Event("change",{bubbles:true}));inputs[1].value="12";inputs[1].dispatchEvent(new Event("change",{bubbles:true}));',
    );
    await evaluate(
      'document.querySelector(".collection-controls button[aria-pressed]").click()',
    );
    await navigate("/library", ".library-entry-meta");
    assert.match(
      await evaluate(
        'document.querySelector(".library-entry-meta").textContent',
      ),
      /Completed/,
    );
    assert.equal(
      await evaluate(
        'JSON.parse(localStorage.getItem("gamevault_library_v1"))[0].notes',
      ),
      "Remember this adventure",
    );
    await navigate("/favorites", ".library-entry-meta");
    await navigate("/dashboard", ".dashboard-stats");
    assert.match(
      await evaluate('document.querySelector(".dashboard-stats").textContent'),
      /8.5/,
    );
    for (const width of [1920, 1440, 1024, 768, 390, 375, 320]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      for (const [route, selector] of [
        ["/", ".hero h1"],
        ["/catalogue", ".game-card"],
        ["/library", ".library-entry-meta"],
        ["/dashboard", ".dashboard-stats"],
        ["/games/steam-100", ".collection-controls"],
        ["/deals", ".game-card"],
        ["/subscriptions", ".catalogue-intro"],
      ]) {
        await navigate(route, selector);
        await delay(80);
        const size = await evaluate(
          "({width:innerWidth,scroll:document.documentElement.scrollWidth})",
        );
        assert.ok(
          size.scroll <= size.width + 1,
          route + " overflow at " + width + ": " + JSON.stringify(size),
        );
      }
    }
    await navigate("/catalogue", ".game-card");
    await evaluate('document.querySelector(".menu-toggle").click()');
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector(".main-nav")).display',
      ),
      "grid",
    );
    await evaluate(
      '[...document.querySelectorAll("#primary-nav summary")].find(s=>s.textContent==="My Games").click()',
    );
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll("#primary-nav details")].find(d=>d.querySelector("summary").textContent==="My Games").open',
      ),
      true,
    );
    await evaluate(
      '[...document.querySelectorAll(".main-nav a")].find(a=>a.pathname==="/library").click()',
    );
    await waitFor(
      () => evaluate('location.pathname==="/library"'),
      "grouped mobile navigation",
    );
    await navigate("/", ".lucky-filters");
    await evaluate('{const inputs=document.querySelectorAll(".lucky-filters input");inputs[0].value="85";inputs[0].dispatchEvent(new Event("input",{bubbles:true}));inputs[1].value="105";inputs[1].dispatchEvent(new Event("input",{bubbles:true}));const genre=document.querySelectorAll(".lucky-filters select")[2];genre.value="RPG";genre.dispatchEvent(new Event("change",{bubbles:true}));}');
    await evaluate('document.querySelector(".lucky-filters button").click()');
    await waitFor(() => evaluate('!!document.querySelector(".lucky-result .game-card")'), "lucky result");
    assert.equal(await evaluate('document.querySelector(".lucky-result").textContent.includes("Fixture Game 5")'), true);
    await evaluate('{const score=document.querySelector(".lucky-filters input");score.value="100";score.dispatchEvent(new Event("input",{bubbles:true}));}');
    assert.equal(await evaluate('!!document.querySelector(".lucky-result")'), false, "changing lucky filters clears the previous result");
    await evaluate('document.querySelector(".lucky-filters button").click()');
    await waitFor(() => evaluate('document.body.textContent.includes("No matches in this sample")'), "lucky no-match thresholds");
    assert.equal(await evaluate('document.querySelector(".lucky-filters").closest("section").querySelector("[role=status]").textContent.includes("No matches")'), true);
    await evaluate('{const score=document.querySelector(".lucky-filters input");score.value="101";score.dispatchEvent(new Event("input",{bubbles:true}));}');
    assert.equal(await evaluate('document.querySelector(".lucky-filters input").getAttribute("aria-invalid")'), "true");
    assert.equal(await evaluate('document.getElementById("lucky-score-error").textContent.includes("whole score")'), true);
    const invalidLuckyRequests = requests.filter(r => r.startsWith("/api/games?")).length;
    await evaluate('document.querySelector(".lucky-filters button").focus();document.querySelector(".lucky-filters button").click()');
    assert.equal(await evaluate('document.activeElement===document.querySelector(".lucky-filters input")'), true, "native invalid-submit focus");
    assert.equal(requests.filter(r => r.startsWith("/api/games?")).length, invalidLuckyRequests);
    await evaluate('{const score=document.querySelector(".lucky-filters input");score.value="85";score.dispatchEvent(new Event("input",{bubbles:true}));}');
    holdCatalogueSearch = "";
    await evaluate('document.querySelector(".lucky-filters button").focus();document.querySelector(".lucky-filters button").click()');
    await waitFor(() => Promise.resolve(!!releaseCatalogueRead), "held lucky request");
    assert.equal(await evaluate('document.activeElement===document.querySelector(".lucky-filters button")'), true, "pending pick retains button focus");
    assert.equal(await evaluate('document.querySelector(".lucky-filters button").getAttribute("aria-disabled")'), "true");
    holdCatalogueSearch = null; releaseCatalogueRead(); releaseCatalogueRead = null;
    await waitFor(() => evaluate('document.querySelector(".lucky-filters").closest("section").querySelector("[role=status]").textContent.includes("Picked Fixture Game 5")'), "successful pick announcement");
    catalogueFilterFixtures = true;
    await navigate("/catalogue", ".game-card");
    await evaluate('document.querySelector(".storefront-details").open=true;const price=document.querySelector(".storefront-details input[type=number]");price.value="0";price.dispatchEvent(new Event("input",{bubbles:true}));');
    assert.equal(await evaluate('document.querySelectorAll(".game-card").length'), 1, "zero budget matches only free games");
    await evaluate('{const inputs=document.querySelectorAll(".storefront-details input[type=number]");inputs[2].value="0";inputs[2].dispatchEvent(new Event("input",{bubbles:true}));}');
    assert.equal(await evaluate('document.querySelectorAll(".game-card").length'), 0, "score zero excludes unknown scores");
    await evaluate('{const inputs=document.querySelectorAll(".storefront-details input[type=number]");inputs[0].value="";inputs[0].dispatchEvent(new Event("input",{bubbles:true}));inputs[2].value="";inputs[2].dispatchEvent(new Event("input",{bubbles:true}));inputs[1].value="2025";inputs[1].dispatchEvent(new Event("input",{bubbles:true}));}');
    assert.equal(await evaluate('document.querySelectorAll(".game-card").length'), 16, "number input release year matches dated games");
    await evaluate('{const price=document.querySelector(".storefront-details input[type=number]");price.focus();price.value="-1";price.dispatchEvent(new Event("input",{bubbles:true}));}');
    assert.equal(await evaluate('document.querySelector(".storefront-details input").getAttribute("aria-invalid")'), "true");
    assert.equal(await evaluate('document.querySelector(".storefront-details input").getAttribute("aria-describedby")'), "catalogue-price-error");
    assert.equal(await evaluate('document.querySelector(".results-label").textContent.includes("Correct the highlighted filters")'), true);
    assert.equal(await evaluate('document.body.textContent.includes("No matches on the loaded pages")'), false);
    assert.equal(await evaluate('document.activeElement===document.querySelector(".storefront-details input")'), true);
    for (const width of [320, 375, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "filter error layout at " + width);
    }
    await evaluate('{const price=document.querySelector(".storefront-details input[type=number]");price.value="";price.dispatchEvent(new Event("input",{bubbles:true}));price.focus();}');
    await cdp("Input.insertText", { text: "-" });
    assert.equal(await evaluate('document.querySelector(".storefront-details input").validity.badInput'), true);
    assert.equal(await evaluate('document.querySelector(".storefront-details input").getAttribute("aria-invalid")'), "true");
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Reset filters")).click()');
    await waitFor(() => evaluate('document.querySelectorAll(".game-card").length===16 && !document.querySelector("#catalogue-price-error")'), "valid filter reset");
    assert.equal(await evaluate('document.querySelector(".storefront-details input").validity.valid'), true, "reset clears incomplete numeric input");
    const catalogueAccessibility = await cdp("Accessibility.getFullAXTree");
    assert.ok(catalogueAccessibility.nodes.some(n=>n.role?.value==="button"&&n.name?.value==="Browse Steam games"));
    assert.ok(catalogueAccessibility.nodes.some(n=>n.role?.value==="link"&&n.name?.value==="Open official Steam store"));
    assert.equal(await evaluate('document.querySelector(".results-label").getAttribute("role")'), "status");
    catalogueFilterFixtures = false;
    cataloguePaged = true; failCataloguePage = 2;
    await navigate("/catalogue", ".game-card");
    await evaluate('document.querySelector(".load-more button").click()');
    await waitFor(() => evaluate('!!document.querySelector("p[role=alert]")'), "catalogue later page failure");
    assert.equal(await evaluate('document.querySelectorAll(".game-card").length'), 8);
    failCataloguePage = null;
    await evaluate('document.querySelector(".load-more button").click()');
    await waitFor(() => evaluate('document.querySelectorAll(".game-card").length===16'), "catalogue retry without duplicate boundary item");
    assert.equal(await evaluate('document.body.textContent.includes("reached the end")'), true);
    cataloguePaged = false;
    holdCatalogueSearch = "Fixture Game 1";
    await evaluate('{const input=document.querySelector(".filter-search input");input.value="Fixture Game 1";input.dispatchEvent(new Event("input",{bubbles:true}));}');
    assert.equal(await evaluate('document.querySelectorAll(".game-card").length'), 0, "old cards clear during debounce");
    assert.equal(await evaluate('document.querySelector(".load-more button").disabled'), true);
    await waitFor(() => Promise.resolve(!!releaseCatalogueRead), "held catalogue search");
    await evaluate('{const input=document.querySelector(".filter-search input");input.value="Fixture Game 0";input.dispatchEvent(new Event("input",{bubbles:true}));}');
    await waitFor(() => evaluate('document.querySelectorAll(".game-card").length===1'), "replacement search");
    holdCatalogueSearch = null; releaseCatalogueRead(); releaseCatalogueRead = null;
    await delay(100);
    assert.equal(await evaluate('document.querySelectorAll(".game-card").length'), 1);
    assert.equal(await evaluate('document.querySelector(".game-card").textContent.includes("Fixture Game 0")'), true);
    await evaluate('document.querySelector("#app").__vue_app__.config.globalProperties.$router.push({path:"/catalogue",query:{genre:"RPG"}})');
    await waitFor(() => evaluate('document.querySelectorAll(".game-card").length===8 && document.querySelector("select[aria-label=Genre]").value==="RPG"'), "same-route genre navigation");
    await navigate("/catalogue", ".game-card");
    holdCatalogueSearch = ""; holdCatalogueSource = "steam"; failGames = true;
    await evaluate('{document.querySelector(".storefront-details").open=true;const score=document.querySelectorAll(".storefront-details input[type=number]")[2];score.value="80";score.dispatchEvent(new Event("input",{bubbles:true}));for(const [label,value] of [["Sort games","score"],["Genre","RPG"],["Platform","PC"]]){const control=[...document.querySelectorAll("select")].find(e=>e.getAttribute("aria-label")===label);control.value=value;control.dispatchEvent(new Event("change",{bubbles:true}));}}');
    await waitFor(() => Promise.resolve(!!releaseCatalogueRead), "held failed Steam request");
    failGames = false;
    await evaluate('{const source=[...document.querySelectorAll("select")].find(e=>e.getAttribute("aria-label")==="Data source");source.value="epic";source.dispatchEvent(new Event("change",{bubbles:true}));}');
    await waitFor(() => evaluate('document.querySelector(".results-label").textContent.includes("Epic Games Store test feed")'), "Epic replacement provider");
    assert.equal(await evaluate('document.querySelectorAll(".game-card").length'), 16, "unsupported score does not hide the new storefront");
    assert.equal(await evaluate('document.querySelectorAll(".storefront-details input[type=number]")[2].value'), "");
    assert.equal(await evaluate('document.querySelectorAll(".storefront-details input[type=number]")[2].disabled'), true);
    assert.equal(await evaluate('document.querySelector("select[aria-label=Genre]").disabled'), true);
    assert.equal(await evaluate('document.querySelector("select[aria-label=Genre]").value'), "");
    assert.equal(await evaluate('[...document.querySelectorAll("select")].find(e=>e.getAttribute("aria-label")==="Sort games").value'), "featured");
    holdCatalogueSearch = null; holdCatalogueSource = null; releaseCatalogueRead(); releaseCatalogueRead = null;
    await delay(100);
    assert.equal(await evaluate('!!document.querySelector("p[role=alert]")'), false, "old provider error is discarded");
    assert.equal(await evaluate('document.querySelector(".results-label").textContent.includes("Epic Games Store test feed")'), true);
    const epicQueries = requests.filter(r => r.startsWith("/api/games?")).map(r=>new URL(r,"http://fixture")).filter(u=>u.searchParams.get("source")==="epic");
    assert.ok(epicQueries.length);
    assert.ok(epicQueries.every(u=>!u.searchParams.get("genre")&&!u.searchParams.get("platform")&&u.searchParams.get("sort")==="featured"));
    await navigate("/catalogue", ".game-card");
    holdCatalogueSearch = ""; holdCatalogueSource = "steam";
    await evaluate('{const sort=[...document.querySelectorAll("select")].find(e=>e.getAttribute("aria-label")==="Sort games");sort.value="newest";sort.dispatchEvent(new Event("change",{bubbles:true}));}');
    await waitFor(() => Promise.resolve(!!releaseCatalogueRead), "held successful Steam request");
    await evaluate('{const source=[...document.querySelectorAll("select")].find(e=>e.getAttribute("aria-label")==="Data source");source.value="xbox";source.dispatchEvent(new Event("change",{bubbles:true}));}');
    await waitFor(() => evaluate('document.querySelector(".results-label").textContent.includes("Xbox Console test feed")'), "Xbox replacement provider");
    assert.equal(await evaluate('[...document.querySelectorAll("select")].find(e=>e.getAttribute("aria-label")==="Sort games").value'), "featured");
    assert.equal(await evaluate('[...document.querySelectorAll("select")].find(e=>e.getAttribute("aria-label")==="Sort games").querySelector("option[value=newest]")===null'), true);
    assert.equal(await evaluate('![...document.querySelector("select[aria-label=Platform]").options].some(o=>o.value==="PC")'), true);
    assert.equal(await evaluate('[...document.querySelector("select[aria-label=Platform]").options].some(o=>o.value==="Xbox")'), true);
    holdCatalogueSearch = null; holdCatalogueSource = null; releaseCatalogueRead(); releaseCatalogueRead = null;
    await delay(100);
    assert.equal(await evaluate('document.querySelector(".results-label").textContent.includes("Xbox Console test feed")'), true);
    assert.equal(await evaluate('[...document.querySelectorAll(".game-card")].every(c=>c.textContent.includes("Xbox Console Fixture Game"))'), true, "late success cannot restore old cards");
    await evaluate('{document.querySelector(".storefront-details").open=true;const price=document.querySelector(".storefront-details input[type=number]");price.value="10";price.dispatchEvent(new Event("input",{bubbles:true}));const sort=[...document.querySelectorAll("select")].find(e=>e.getAttribute("aria-label")==="Sort games");sort.value="price";sort.dispatchEvent(new Event("change",{bubbles:true}));}');
    await waitFor(() => evaluate('!document.querySelector(".card-grid[aria-busy=true]")'), "Xbox price sort completion");
    await evaluate('{const source=[...document.querySelectorAll("select")].find(e=>e.getAttribute("aria-label")==="Data source");source.value="rawg";source.dispatchEvent(new Event("change",{bubbles:true}));}');
    await waitFor(() => evaluate('document.querySelector(".results-label").textContent.includes("RAWG test feed")'), "metadata-only replacement provider");
    assert.equal(await evaluate('document.querySelectorAll(".game-card").length'), 16, "unsupported price does not hide metadata");
    assert.equal(await evaluate('document.querySelector(".storefront-details input").value'), "");
    assert.equal(await evaluate('document.querySelector(".storefront-details input").disabled'), true);
    assert.equal(await evaluate('!!document.querySelector("#catalogue-price-unavailable")'), true);
    assert.equal(await evaluate('document.querySelectorAll(".storefront-details input[type=number]")[2].disabled'), false);
    for (const width of [320, 375, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "storefront capability layout at " + width);
    }

    await navigate("/catalogue", ".game-card");
    await evaluate(
      'const input=document.querySelector(".filter-search input");input.value="no such game";input.dispatchEvent(new Event("input",{bubbles:true}));',
    );
    await waitFor(
      () => evaluate('document.body.textContent.includes("No matches")'),
      "search empty state",
    );
    assert.ok(
      requests.some(
        (r) =>
          r.includes("search=no+such+game") ||
          r.includes("search=no%20such%20game"),
      ),
    );
    failGames = true;
    await navigate("/catalogue", 'p[role="alert"]');
    failGames = false;
    await evaluate('document.querySelector(".load-more button").click()');
    await waitFor(
      () => evaluate('!!document.querySelector(".game-card")'),
      "retry",
    );
    await evaluate('document.querySelector("button.avatar").click()');
    await waitFor(
      () => evaluate('!!document.querySelector("[role=dialog]")'),
      "auth dialog",
    );
    assert.equal(
      await evaluate('document.activeElement.hasAttribute("data-close-auth")'),
      true,
    );
    await cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await waitFor(
      () => evaluate('!document.querySelector("[role=dialog]")'),
      "Escape dialog",
    );
    await navigate("/games/steam-100", ".collection-controls");
    await evaluate(
      '[...document.querySelectorAll(".collection-controls button")].find(b=>b.textContent.includes("Remove from Library")).click()',
    );
    assert.equal(
      await evaluate(
        'JSON.parse(localStorage.getItem("gamevault_library_v1")).length',
      ),
      1,
    );
    await evaluate('document.querySelector(".confirmation .primary").click()');
    assert.equal(
      await evaluate(
        'JSON.parse(localStorage.getItem("gamevault_library_v1")).length',
      ),
      0,
    );

    holdLogin = true;
    await evaluate('document.querySelector("button.avatar").click()');
    await waitFor(
      () => evaluate('!!document.querySelector(".auth-dialog form")'),
      "cancelled sign-in dialog",
    );
    await evaluate(
      '(()=>{const form=document.querySelector(".auth-dialog form"),email=form.querySelector("input[type=email]"),password=form.querySelector("input[type=password]");email.value="fixture@example.invalid";email.dispatchEvent(new Event("input",{bubbles:true}));password.value="fixture-password";password.dispatchEvent(new Event("input",{bubbles:true}));form.requestSubmit();})()',
    );
    await waitFor(async () => !!releaseLogin, "held login requested");
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll(".auth-dialog input")].every(i=>i.disabled)&&document.querySelector(".switch-auth").disabled',
      ),
      true,
      "pending auth controls",
    );
    await cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await waitFor(
      () => evaluate('!document.querySelector(".auth-dialog")'),
      "close pending sign-in",
    );
    holdLogin = false;
    releaseLogin();
    releaseLogin = null;
    await delay(150);
    assert.equal(
      await evaluate('localStorage.getItem("gamevault_token")'),
      null,
      "late login cannot persist after close",
    );
    assert.equal(
      await evaluate(
        '!!document.querySelector("button.avatar")&&!document.querySelector(".auth-signout")',
      ),
      true,
      "cancelled login stays guest",
    );
    // Account flow uses the stub auth/API; the real repository has a separate MySQL test.
    await navigate("/", ".hero h1");
    await evaluate('document.querySelector(".hero-actions button").click()');
    await evaluate('document.querySelector("button.avatar").click()');
    await waitFor(
      () => evaluate('!!document.querySelector("[role=dialog]")'),
      "account sign in",
    );
    await evaluate(
      'const email=document.querySelector("input[type=email]");email.value="fixture@example.invalid";email.dispatchEvent(new Event("input",{bubbles:true}));const password=document.querySelector("input[type=password]");password.value="fixture-password";password.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector(".auth-dialog form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));',
    );
    await waitFor(
      () =>
        evaluate(
          '!!document.querySelector(".auth-signout") && !document.querySelector("[role=dialog]")',
        ),
      "signed-in account",
    );
    await navigate("/library", ".import-panel button");
    await waitFor(
      () =>
        evaluate('!document.querySelector(".import-panel button").disabled'),
      "account library ready",
    );
    assert.equal(
      await evaluate('document.querySelectorAll(".library-entry-meta").length'),
      0,
    );
    await evaluate('document.querySelector(".import-panel button").click()');
    await waitFor(
      () => evaluate('!!document.querySelector(".library-entry-meta")'),
      "device import",
    );
    await navigate("/games/steam-100", ".collection-controls select");
    await evaluate(
      'const notes=document.querySelector(".notes-label textarea");notes.value="Account journal";notes.dispatchEvent(new Event("change",{bubbles:true}));',
    );
    await waitFor(
      () =>
        Promise.resolve(
          accountEntries.get("steam-100")?.notes === "Account journal",
        ),
      "account journal saved",
    );
    await navigate("/games/steam-100", ".collection-controls select");
    assert.equal(
      await evaluate('document.querySelector(".notes-label textarea").value'),
      "Account journal",
    );
    await evaluate('document.querySelector(".auth-signout").click()');
    await waitFor(
      () => evaluate('!!document.querySelector("button.avatar")'),
      "sign out",
    );
    assert.equal(
      await evaluate('document.querySelector(".notes-label textarea").value'),
      "",
    );
    assert.equal(accountEntries.get("steam-100").notes, "Account journal");
    await navigate("/collections", ".workspace-form");
    await evaluate(
      'const collectionInput=document.querySelector(".workspace-form input");collectionInput.value="Browser collection";collectionInput.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector(".workspace-form").requestSubmit();',
    );
    await waitFor(
      () => evaluate('document.querySelectorAll(".collection-row").length===1'),
      "collection creation",
    );
    await navigate("/journal", "#journal-form");
    await evaluate(
      'const form=document.querySelector("#journal-form");const gameSelect=form.querySelector("select");gameSelect.value="steam-100";gameSelect.dispatchEvent(new Event("change",{bubbles:true}));const text=form.querySelector("textarea");text.value="Private session notes <b>not HTML</b>";text.dispatchEvent(new Event("input",{bubbles:true}));const spoilerInput=form.querySelector("input[type=checkbox]");spoilerInput.checked=true;spoilerInput.dispatchEvent(new Event("change",{bubbles:true}));form.requestSubmit();',
    );
    await waitFor(
      () => evaluate('document.querySelectorAll(".journal-entry").length===1'),
      "journal entry saved",
    );
    assert.equal(
      await evaluate('document.querySelector(".journal-entry details").open'),
      false,
    );
    await navigate("/journal", ".journal-entry");
    assert.equal(
      await evaluate(
        'document.querySelector(".journal-entry .user-text").textContent',
      ),
      "Private session notes <b>not HTML</b>",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".journal-entry .user-text b")===null',
      ),
      true,
    );
    await navigate("/play-next", "h1");
    await evaluate(
      '[...document.querySelectorAll("select")].find(s=>s.getAttribute("aria-label")==="Picker scope").value="all";[...document.querySelectorAll("select")].find(s=>s.getAttribute("aria-label")==="Picker scope").dispatchEvent(new Event("change",{bubbles:true}));',
    );
    await evaluate('document.querySelector("main .primary").click()');
    await waitFor(
      () => evaluate('!!document.querySelector(".picker-result")'),
      "library picker",
    );
    await navigate("/compare", ".comparison-grid");
    await evaluate(
      'document.querySelector(".workspace-form input").value="Fixture";document.querySelector(".workspace-form input").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector(".workspace-form").requestSubmit();',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelectorAll(".compare-results button").length>1',
        ),
      "comparison search",
    );
    await evaluate('document.querySelector(".compare-results button").click()');
    await evaluate(
      '{const replace=document.querySelector(".workspace-form select");replace.value="1";replace.dispatchEvent(new Event("change",{bubbles:true}));document.querySelector(".workspace-form").requestSubmit();}',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelectorAll(".compare-results button").length>1',
        ),
      "second comparison search",
    );
    await evaluate(
      'document.querySelectorAll(".compare-results button")[1].click()',
    );
    await waitFor(
      () =>
        evaluate('document.querySelectorAll(".comparison-cover").length===2'),
      "two comparison selections",
    );
    await evaluate(
      '[...document.querySelectorAll("main button")].find(b=>b.textContent.includes("Swap games")).click()',
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".comparison-grid h2").textContent',
      ),
      "Fixture Game 1",
    );
    await navigate("/upcoming", ".game-card");
    await evaluate(
      'document.querySelector("main .card-grid article > button").click()',
    );
    await waitFor(
      () => evaluate('document.body.textContent.includes("Unfollow release")'),
      "release watch",
    );
    await navigate("/upcoming", ".game-card");
    assert.equal(
      await evaluate('document.body.textContent.includes("Unfollow release")'),
      true,
    );
    await navigate("/wrapped", ".dashboard-stats");
    await evaluate(
      'window.__downloaded=null;HTMLAnchorElement.prototype.click=function(){window.__downloaded={url:this.href,name:this.download};};[...document.querySelectorAll("main button")].find(b=>b.textContent.includes("Download summary PNG")).click();',
    );
    await waitFor(
      () => evaluate("!!window.__downloaded"),
      "share PNG generated",
    );
    assert.equal(
      await evaluate(
        "fetch(window.__downloaded.url).then(r=>r.arrayBuffer()).then(buffer=>new Uint8Array(buffer)[0])",
      ),
      137,
    );
    for (const width of [1920, 1440, 1024, 768, 390, 375, 320]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      for (const [route, selector] of [
        ["/collections", ".workspace-form"],
        ["/journal", "#journal-form"],
        ["/compare", ".comparison-grid"],
        ["/upcoming", ".game-card"],
        ["/play-next", "h1"],
        ["/wrapped", ".dashboard-stats"],
        ["/preferences", ".workspace-form"],
        ["/backlog", "h1"],
      ]) {
        await navigate(route, selector);
        await delay(80);
        const size = await evaluate(
          "({width:innerWidth,scroll:document.documentElement.scrollWidth})",
        );
        assert.ok(
          size.scroll <= size.width + 1,
          route + " overflow at " + width + ": " + JSON.stringify(size),
        );
      }
    }
    await navigate("/preferences", ".workspace-form");
    await evaluate('document.querySelector("button.avatar").click()');
    await waitFor(
      () => evaluate('!!document.querySelector("[role=dialog]")'),
      "workspace sign in",
    );
    await evaluate(
      '{const email=document.querySelector("input[type=email]");email.value="fixture@example.invalid";email.dispatchEvent(new Event("input",{bubbles:true}));const password=document.querySelector("input[type=password]");password.value="fixture-password";password.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector(".auth-dialog form").requestSubmit();}',
    );
    await waitFor(
      () =>
        evaluate(
          '!!document.querySelector(".auth-signout")&&!document.querySelector("[role=dialog]")',
        ),
      "workspace account ready",
    );
    await waitFor(
      () =>
        evaluate(
          '[...document.querySelectorAll("main button")].some(b=>b.textContent.includes("Import device workspace")&&!b.disabled)',
        ),
      "workspace import ready",
    );
    await evaluate(
      '[...document.querySelectorAll("main button")].find(b=>b.textContent.includes("Import device workspace")).click()',
    );
    await waitFor(
      () => Promise.resolve(accountJournal.size === 1),
      "private workspace imported",
    );
    await navigate("/journal", ".journal-entry");
    assert.equal(
      await evaluate(
        'document.querySelector(".journal-entry .user-text").textContent',
      ),
      "Private session notes <b>not HTML</b>",
    );
    failNextJournalCreateAfterCommit = true;
    await evaluate(
      '{const form=document.querySelector("#journal-form");const select=form.querySelector("select");select.value="steam-100";select.dispatchEvent(new Event("change",{bubbles:true}));const kind=form.querySelectorAll("select")[1];kind.value="review";kind.dispatchEvent(new Event("change",{bubbles:true}));const notes=form.querySelector("textarea");notes.value="A private review";notes.dispatchEvent(new Event("input",{bubbles:true}));form.requestSubmit();}',
    );
    await waitFor(
      () => Promise.resolve(accountJournal.size === 2),
      "private review created",
    );
    await waitFor(
      () =>
        evaluate(
          'document.body.textContent.includes("The journal change could not be confirmed")',
        ),
      "uncertain create response",
    );
    assert.equal(accountJournal.size, 2);
    await evaluate(
      '[...document.querySelectorAll("main button")].find(button=>button.textContent.includes("Reload journal")).click()',
    );
    await waitFor(
      () => evaluate('document.querySelectorAll(".journal-entry").length===2'),
      "committed entry recovered",
    );
    await evaluate('document.querySelector("#journal-form").requestSubmit()');
    await waitFor(
      () =>
        evaluate('document.querySelector("#journal-form textarea").value===""'),
      "same draft retried",
    );
    assert.equal(accountJournal.size, 2);
    await waitFor(
      () =>
        evaluate(
          '[...document.querySelectorAll(".journal-entry .user-text")].some(node=>node.textContent==="A private review")',
        ),
      "review rendered",
    );
    await evaluate(
      '[...document.querySelectorAll(".journal-entry")].find(article=>article.textContent.includes("A private review")).querySelector("button").click()',
    );
    await evaluate(
      '{const notes=document.querySelector("#journal-form textarea");notes.value="Edited private review";notes.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#journal-form").requestSubmit();}',
    );
    await waitFor(
      () =>
        Promise.resolve(
          [...accountJournal.values()].some(
            (e) => e.notes === "Edited private review",
          ),
        ),
      "private review edited",
    );
    await navigate("/journal", ".journal-entry");
    await waitFor(
      () =>
        evaluate(
          '[...document.querySelectorAll(".journal-entry .user-text")].some(node=>node.textContent==="Edited private review")',
        ),
      "edited review restored",
    );
    await evaluate(
      'window.confirm=message=>{window.__confirmed=message;return true;};[...document.querySelectorAll(".journal-entry")].find(article=>article.textContent.includes("Edited private review")).querySelectorAll("button")[1].click()',
    );
    await waitFor(
      () => Promise.resolve(accountJournal.size === 1),
      "private review deleted",
    );
    assert.match(await evaluate("window.__confirmed"), /Delete/);
    for (let index = 0; index < 52; index++) {
      const id = require("node:crypto").randomUUID();
      accountJournal.set(id, {
        id,
        game: games[0],
        date: "2026-01-02",
        kind: "session",
        minutes: 1,
        notes: "Paged entry " + index,
        progress: "",
        tags: [],
        spoiler: false,
        rating: null,
        version: 0,
      });
    }
    await navigate("/journal", ".journal-entry");
    await waitFor(
      () => evaluate('document.querySelectorAll(".journal-entry").length===24'),
      "first journal page",
    );
    await evaluate('document.querySelector(".load-more button").click()');
    await waitFor(
      () => evaluate('document.querySelectorAll(".journal-entry").length===48'),
      "second journal page",
    );
    await evaluate('document.querySelector(".load-more button").click()');
    await waitFor(
      () => evaluate('document.querySelectorAll(".journal-entry").length===53'),
      "final journal page",
    );
    await evaluate(
      '{const search=[...document.querySelectorAll("input")].find(input=>input.getAttribute("aria-label")==="Search journal");search.value="Paged entry 51";search.dispatchEvent(new Event("input",{bubbles:true}));}',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelectorAll(".journal-entry").length===1 && document.querySelector(".journal-entry").textContent.includes("Paged entry 51")',
        ),
      "server journal search",
    );
    await navigate("/preferences", ".private-export");
    await waitFor(() => evaluate('document.querySelector(".private-export button").getAttribute("aria-disabled")==="false"'), "account export prerequisites");
    await evaluate('window.__privateFiles=[];HTMLAnchorElement.prototype.click=function(){window.__privateFiles.push({name:this.download,text:fetch(this.href).then(r=>r.text())});};');
    failPrivateExport = true;
    await evaluate('document.querySelector(".private-export button").click()');
    await waitFor(() => evaluate('document.querySelector("#private-export-error").textContent.includes("Export fixture unavailable")'), "export failure has retry feedback");
    assert.equal(await evaluate('window.__privateFiles.length'), 0);
    failPrivateExport = false; holdPrivateExport = true;
    const exportReadsBefore = privateExportReads;
    await evaluate('document.querySelector(".private-export button").focus();document.querySelector(".private-export button").click();document.querySelector(".private-export button").click()');
    await waitFor(() => Promise.resolve(!!releasePrivateExport), "held account export");
    assert.equal(privateExportReads - exportReadsBefore, 1);
    assert.equal(await evaluate('document.activeElement===document.querySelector(".private-export button")'), true);
    holdPrivateExport = false; releasePrivateExport(); releasePrivateExport = null;
    await waitFor(() => evaluate('window.__privateFiles.length===1'), "complete account JSON download");
    const accountFile = JSON.parse(await evaluate('window.__privateFiles[0].text'));
    assert.equal(accountFile.data.journal.length, accountJournal.size);
    assert.equal(accountFile.data.journal.length, 53);
    assert.equal(accountFile.data.library.length, accountEntries.size);
    assert.equal(accountFile.source.kind, "account");
    assert.equal("journal" in accountFile.data.workspace, false);
    const originalWorkspaceForExport = await evaluate('localStorage.getItem("gamevault_workspace_v1")');
    await evaluate('{const source=document.querySelector(".private-export select");source.value="device";source.dispatchEvent(new Event("change",{bubbles:true}));}');
    await evaluate('document.querySelector(".private-export button").click()');
    await waitFor(() => evaluate('window.__privateFiles.length===2'), "separate device JSON download");
    const deviceFile = JSON.parse(await evaluate('window.__privateFiles[1].text'));
    assert.equal(deviceFile.source.kind, "device");
    assert.deepEqual(deviceFile.data.workspace.profile, JSON.parse(originalWorkspaceForExport).profile);
    assert.equal(deviceFile.data.journal.length, JSON.parse(originalWorkspaceForExport).journal.length);
    assert.equal(await evaluate('localStorage.getItem("gamevault_workspace_v1")'), originalWorkspaceForExport);
    for (const width of [320, 375, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "private export layout at " + width);
    }
    await evaluate('{const source=document.querySelector(".private-export select");source.value="account";source.dispatchEvent(new Event("change",{bubbles:true}));}');
    holdPrivateExport = true;
    await evaluate('document.querySelector(".private-export button").click()');
    await waitFor(() => Promise.resolve(!!releasePrivateExport), "export held across authentication change");
    await evaluate('document.querySelector(".auth-signout").click()');
    await waitFor(() => evaluate('!!document.querySelector("button.avatar")'), "export sign out");
    await evaluate('document.querySelector("button.avatar").click()');
    await waitFor(() => evaluate('!!document.querySelector(".auth-dialog form")'), "export reauthentication dialog");
    await evaluate('(()=>{const f=document.querySelector(".auth-dialog form"),email=f.querySelector("input[type=email]"),password=f.querySelector("input[type=password]");email.value="fixture@example.invalid";email.dispatchEvent(new Event("input",{bubbles:true}));password.value="fixture-password";password.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()');
    await waitFor(() => evaluate('!!document.querySelector(".auth-signout")&&document.querySelector(".private-export button").getAttribute("aria-disabled")==="false"'), "export new session ready");
    holdPrivateExport = false; releasePrivateExport(); releasePrivateExport = null;
    await delay(100);
    assert.equal(await evaluate('window.__privateFiles.length'), 2, "obsolete private response cannot download after same-token sign-in");
    async function choosePreviewFile(contents, name = "private-preview.json") {
      await evaluate('(()=>{const payload='+JSON.stringify({contents,name})+';const files=new DataTransfer();files.items.add(new File([payload.contents],payload.name,{type:"application/json"}));const input=document.querySelector(".restore-preview input[type=file]");input.files=files.files;input.dispatchEvent(new Event("change",{bubbles:true}));})()');
    }
    const accountBeforePreview = JSON.stringify(accountWorkspace), libraryBeforePreview = JSON.stringify([...accountEntries.values()]);
    const invalidPreview = { ...accountFile, formatVersion: 99 };
    const readsBeforeInvalidPreview = privateExportReads;
    await choosePreviewFile(JSON.stringify(invalidPreview));
    await evaluate('document.querySelector(".preview-backup").click()');
    await waitFor(() => evaluate('document.querySelector("#restore-preview-error").textContent.includes("version is not supported")'), "unsupported backup format feedback");
    assert.equal(privateExportReads, readsBeforeInvalidPreview);
    assert.equal(await evaluate('document.querySelector(".restore-preview input[type=file]").getAttribute("aria-invalid")'), "true");
    assert.equal(await evaluate('!!document.querySelector(".restore-preview-summary")'), false);
    const previewBackup = JSON.parse(JSON.stringify(accountFile));
    previewBackup.data.journal.push({ ...previewBackup.data.journal[0], id: "legacy-preview-row", notes: "Private preview text <script>must not render</script>" });
    const previewText = JSON.stringify(previewBackup);
    await choosePreviewFile(previewText);
    await evaluate('document.querySelector(".preview-backup").focus();document.querySelector(".preview-backup").click();document.querySelector(".preview-backup").click()');
    await waitFor(() => evaluate('!!document.querySelector(".restore-preview-summary")'), "complete read-only restore preview");
    assert.equal(privateExportReads, readsBeforeInvalidPreview + 1);
    assert.deepEqual(await evaluate('[...[...document.querySelectorAll(".restore-preview tbody tr")].find(r=>r.querySelector("th").textContent==="Journal entries").querySelectorAll("td")].map(cell=>Number(cell.textContent))'), [54, 1, 53]);
    assert.equal(await evaluate('document.querySelector(".preview-issues").textContent.includes("legacy identifiers")'), true);
    assert.equal(await evaluate('document.querySelector(".restore-preview input[type=file]").files[0].text()'), previewText, "preview does not rewrite legacy IDs or file text");
    assert.equal(await evaluate('!!document.querySelector(".restore-preview-summary script")'), false);
    assert.equal(await evaluate('document.activeElement===document.querySelector(".preview-backup")'), true);
    assert.equal(await evaluate('window.__privateFiles.length'), 2, "preview starts no download");
    assert.equal(JSON.stringify(accountWorkspace), accountBeforePreview);
    assert.equal(JSON.stringify([...accountEntries.values()]), libraryBeforePreview);
    for (const width of [320, 375, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "read-only preview layout at " + width);
    }
    const savedDeviceBeforePreview = await evaluate('localStorage.getItem("gamevault_workspace_v1")');
    await evaluate('{const target=document.querySelector(".restore-preview select");target.value="device";target.dispatchEvent(new Event("change",{bubbles:true}));}');
    assert.equal(await evaluate('!!document.querySelector(".restore-preview-summary")'), false, "destination changes require a fresh comparison");
    await evaluate('document.querySelector(".preview-backup").click()');
    await waitFor(() => evaluate('!!document.querySelector(".restore-preview-summary")'), "device conflict preview");
    assert.equal(privateExportReads, readsBeforeInvalidPreview + 1);
    assert.equal(await evaluate('localStorage.getItem("gamevault_workspace_v1")'), savedDeviceBeforePreview);
    await evaluate('window.dispatchEvent(new StorageEvent("storage",{key:"unrelated"}))');
    assert.equal(await evaluate('!!document.querySelector(".restore-preview-summary")'), true);
    await evaluate('window.dispatchEvent(new StorageEvent("storage",{key:"gamevault_workspace_v1"}))');
    assert.equal(await evaluate('!!document.querySelector(".restore-preview-summary")'), false, "cross-tab changes invalidate conflict counts");
    assert.equal(await evaluate('document.querySelector(".restore-preview input[type=file]").files.length'), 1, "invalidation retains the selected original file");
    assert.equal(await evaluate('document.querySelector("#restore-preview-error").textContent.includes("may have changed")'), true);
    await evaluate('document.querySelector(".preview-backup").click()');
    await waitFor(() => evaluate('!!document.querySelector(".restore-preview-summary")'), "refreshed device conflict preview");
    await evaluate('window.dispatchEvent(new Event("focus"))');
    assert.equal(await evaluate('!!document.querySelector(".restore-preview-summary")'), false, "returning to the page requires a fresh comparison");
    await evaluate('document.querySelector(".preview-backup").click()');
    await waitFor(() => evaluate('!!document.querySelector(".restore-preview-summary")'), "preview after returning focus");
    assert.equal(privateExportReads, readsBeforeInvalidPreview + 1);
    assert.equal(await evaluate('localStorage.getItem("gamevault_workspace_v1")'), savedDeviceBeforePreview);
    await evaluate('document.querySelector(".clear-backup").click()');
    assert.equal(await evaluate('document.querySelector(".restore-preview input[type=file]").files.length'), 0);
    await evaluate('{const target=document.querySelector(".restore-preview select");target.value="account";target.dispatchEvent(new Event("change",{bubbles:true}));window.__nativeBackupRead=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){return new Promise(resolve=>{window.__releaseBackupRead=()=>window.__nativeBackupRead.call(this).then(resolve);});};}');
    await choosePreviewFile(previewText);
    await evaluate('document.querySelector(".preview-backup").click()');
    await waitFor(() => evaluate('typeof window.__releaseBackupRead==="function"'), "held local backup read");
    await evaluate('document.querySelector(".clear-backup").click();window.__releaseBackupRead();File.prototype.arrayBuffer=window.__nativeBackupRead;');
    await delay(100);
    assert.equal(privateExportReads, readsBeforeInvalidPreview + 1, "cancelled local read cannot start an account comparison");
    assert.equal(await evaluate('!!document.querySelector(".restore-preview-summary")'), false);
    assert.equal(await evaluate('document.querySelector(".restore-preview input[type=file]").files.length'), 0);
    failSummaryYear = 2025;
    await navigate("/wrapped", ".dashboard-stats");
    await evaluate('document.querySelector(".year-control input").value=2026;document.querySelector(".year-control input").dispatchEvent(new Event("input",{bubbles:true}))');
    await waitFor(() => evaluate('document.body.textContent.includes("Retry previous year")'), "previous-year failure is recoverable");
    assert.equal(await evaluate('!!document.querySelector(".dashboard-stats")'), true);
    assert.equal(await evaluate('document.body.textContent.includes("Logged session change:")'), false);
    failSummaryYear = null;
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Retry previous year")).click()');
    await waitFor(() => evaluate('document.body.textContent.includes("Logged session change:")'), "independent previous-year retry");
    assert.equal(await evaluate('document.body.textContent.includes("2025: 0 dated completions, 0.0 logged session hours.")'), true);
    await navigate("/library", ".library-entry-meta");
    await waitFor(
      () =>
        evaluate(
          '[...document.querySelectorAll("main button")].some(b=>b.textContent.includes("List view")&&!b.disabled)',
        ),
      "library view ready",
    );
    await evaluate(
      '[...document.querySelectorAll("main button")].find(b=>b.textContent.includes("List view")).click()',
    );
    await waitFor(
      () =>
        Promise.resolve(
          accountWorkspace.data.preferences.libraryView === "list",
        ),
      "library view saved",
    );
    await navigate("/library", ".library-list");
    assert.equal(
      await evaluate('!!document.querySelector(".library-list")'),
      true,
    );
    await navigate("/deals", ".game-card");
    assert.equal(
      await evaluate('document.querySelectorAll(".game-card").length'),
      4,
    );
    await evaluate('document.querySelector(".load-more button").click()');
    await waitFor(
      () => evaluate('document.querySelectorAll(".game-card").length===8'),
      "more deals appended",
    );
    await evaluate(
      'const select=[...document.querySelectorAll("select")].find(s=>s.getAttribute("aria-label")==="Deals storefront");select.value="gog";select.dispatchEvent(new Event("change",{bubbles:true}));',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelectorAll(".game-card").length===4 && document.querySelector(".game-card").getAttribute("href").includes("gog-")',
        ),
      "storefront deals filter",
    );
    await evaluate(
      'const budgetSelect=document.querySelector(".deal-budget select");budgetSelect.value="custom";budgetSelect.dispatchEvent(new Event("change",{bubbles:true}));',
    );
    await waitFor(
      () => evaluate('!!document.querySelector("#custom-deal-budget")'),
      "custom deals budget",
    );
    await evaluate(
      'const amount=document.querySelector("#custom-deal-budget");amount.value="102.50";amount.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector(".custom-budget-form").requestSubmit();',
    );
    await waitFor(
      () => evaluate('document.querySelectorAll(".game-card").length===3'),
      "custom budget applied to source",
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    // Social UI uses fixture APIs; MySQL authorization is exercised separately.
    await evaluate('localStorage.setItem("gamevault_token","fixture-token")');
    await navigate("/social/studio", "form.social-form");
    await evaluate(
      'const f=document.querySelector("form.social-form"),inputs=f.querySelectorAll("input");for(const [n,v] of [[0,"fixture_player"],[1,"Fixture Player"]]){inputs[n].value=v;inputs[n].dispatchEvent(new Event("input",{bubbles:true}));}const select=f.querySelector("select");select.value="public";select.dispatchEvent(new Event("change",{bubbles:true}));f.requestSubmit();',
    );
    await waitFor(
      () =>
        evaluate(
          'document.body.textContent.includes("Profile and preferences saved")',
        ),
      "social profile saved",
    );
    assert.equal(socialProfile.username, "fixture_player");
    await evaluate(
      '{const f=document.querySelector("form.social-form"),fieldset=[...f.querySelectorAll("fieldset")].find(x=>x.querySelector("legend").textContent==="Dashboard widgets");fieldset.querySelector("input[value=genres]").click();fieldset.querySelectorAll("button")[1].click();f.requestSubmit();}',
    );
    await waitFor(
      () =>
        evaluate(
          'document.body.textContent.includes("Profile and preferences saved")',
        ),
      "widget settings saved",
    );
    await navigate("/dashboard", ".dashboard-widget-stack");
    assert.match(
      await evaluate(
        'document.querySelector(".dashboard-widget-stack").textContent',
      ),
      /Your collection at a glance/,
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".dashboard-widget-stack").textContent.includes("Genre mix")',
      ),
      false,
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".dashboard-widget-stack").firstElementChild.tagName',
      ),
      "SECTION",
    );

    await navigate("/social/studio", "form.social-form");
    await evaluate(
      '(async()=>{const form=document.querySelector("form.social-form"),field=[...form.querySelectorAll("fieldset")].find(x=>x.querySelector("legend").textContent==="Homepage sections");for(const input of field.querySelectorAll("input[type=checkbox]")){if(input.value!=="rated"&&input.checked){input.click();await new Promise(requestAnimationFrame);}}form.requestSubmit();})()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.body.textContent.includes("Profile and preferences saved")',
        ),
      "homepage sections saved",
    );
    await waitFor(
      async () =>
        socialProfile.settings.homeSections.length === 1 &&
        socialProfile.settings.homeSections[0] === "rated",
      "homepage preferences persisted",
    );
    await navigate("/", ".game-carousel");
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".game-carousel")?.closest("section").textContent.includes("Top rated")',
        ),
      "account homepage preferences loaded",
    );
    assert.match(
      await evaluate(
        'document.querySelector(".game-carousel").closest("section").textContent',
      ),
      /Top rated/,
    );
    assert.match(
      await evaluate(
        'document.querySelector(".game-carousel .game-card").textContent',
      ),
      /Fixture Game 15/,
    );
    await navigate("/u/fixture_player", ".social-profile-hero h1");
    assert.equal(
      await evaluate(
        'document.querySelector(".social-profile-hero h1").textContent',
      ),
      "Fixture Player",
    );
    await navigate("/games/steam-100", ".community-reviews form.social-form");
    await evaluate(
      'const f=document.querySelector(".community-reviews form.social-form"),inputs=f.querySelectorAll("input");inputs[0].value="Public fixture review";inputs[0].dispatchEvent(new Event("input",{bubbles:true}));const body=f.querySelector("textarea");body.value="<script>window.__storedXss=1</script> An excellent game.";body.dispatchEvent(new Event("input",{bubbles:true}));const spoiler=f.querySelector("input[type=checkbox]");spoiler.click();f.requestSubmit();',
    );
    await waitFor(
      () => evaluate('!!document.querySelector(".review-card details")'),
      "spoiler review published",
    );
    assert.equal(socialReviews.size, 1);
    assert.equal(await evaluate("window.__storedXss"), undefined);
    await evaluate(
      'document.querySelector(".review-card .hero-actions button").click()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".review-card .hero-actions button").getAttribute("aria-pressed")==="true"',
        ),
      "review like",
    );
    await navigate("/community/collections/new", "form.social-form");
    await evaluate(
      'const f=document.querySelector("form.social-form"),input=f.querySelector("input");input.value="Fixture shared collection";input.dispatchEvent(new Event("input",{bubbles:true}));const visibility=[...f.querySelectorAll("select")].at(-1);visibility.value="public";visibility.dispatchEvent(new Event("change",{bubbles:true}));f.requestSubmit();',
    );
    await waitFor(
      () => evaluate('document.body.textContent.includes("Share this page")'),
      "shared collection saved",
    );
    assert.equal(socialCollections.size, 1);
    await navigate(
      "/community?tab=Notifications",
      ".social-page .account-panel",
    );
    assert.match(
      await evaluate('document.querySelector("main").textContent'),
      /Achievement unlocked/,
    );
    for (const width of [1920, 1440, 768, 390, 375, 320]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      for (const [path, selector] of [
        ["/community", ".social-tabs"],
        ["/social/studio", "form.social-form"],
        ["/u/fixture_player", ".social-profile-hero"],
        ["/community/collections/collection-0", ".social-game-grid"],
      ]) {
        await navigate(path, selector);
        await delay(80);
        assert.equal(
          await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
          true,
          path + " social overflow at " + width,
        );
      }
    }
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate("/", ".recommendation-feedback");
    const dismissedHref = await evaluate(
      'document.querySelector(".recommendation-feedback").closest("article").querySelector("a.game-card").getAttribute("href")',
    );
    const dismissedSlug = dismissedHref.split("/").pop();
    await evaluate(
      'document.querySelector(".recommendation-feedback").querySelectorAll("button")[1].click()',
    );
    await waitFor(
      async () =>
        accountWorkspace.data.preferences.recommendationFeedback?.[
          dismissedSlug
        ]?.choice === "not-interested",
      "private feedback persisted",
    );
    await navigate("/", ".recommendation-feedback");
    await waitFor(
      () =>
        evaluate(
          '!document.querySelector(".storage-warning")&&!!document.querySelector(".recommendation-feedback")',
        ),
      "account feedback reloaded",
    );
    await waitFor(
      () =>
        evaluate(
          '![...document.querySelectorAll(".recommendation-feedback")].some(el=>el.closest("article").querySelector("a.game-card").getAttribute("href")===' +
            JSON.stringify(dismissedHref) +
            ")",
        ),
      "dismissed recommendation excluded after refresh",
    );
    await navigate("/games/steam-100", ".game-discussions form");
    await evaluate(
      '(()=>{const f=document.querySelector(".game-discussions form");const title=f.querySelector("input"),body=f.querySelector("textarea");title.value="A fixture discussion";title.dispatchEvent(new Event("input",{bubbles:true}));body.value="Escaped <script> content";body.dispatchEvent(new Event("input",{bubbles:true}));f.querySelector("input[type=checkbox]").click();f.requestSubmit();})()',
    );
    await waitFor(async () => discussionThreads.size === 1, "discussion saved");
    await waitFor(
      () =>
        evaluate(
          '[...document.querySelectorAll(".game-discussions button")].some(b=>b.textContent.includes("View replies"))',
        ),
      "discussion reloaded",
    );
    await evaluate(
      '[...document.querySelectorAll(".game-discussions button")].find(b=>b.textContent.includes("View replies")).click()',
    );
    await waitFor(
      () =>
        evaluate('!!document.querySelector(".discussion-replies textarea")'),
      "replies opened",
    );
    await evaluate(
      '(()=>{const f=document.querySelector(".discussion-replies form"),b=f.querySelector("textarea");b.value="A real reply fixture";b.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(async () => discussionReplies.size === 1, "reply saved");
    await waitFor(
      () =>
        evaluate(
          '[...document.querySelectorAll(".discussion-replies button")].some(b=>b.textContent.trim()==="Edit reply")',
        ),
      "editable reply loaded",
    );
    await evaluate(
      '[...document.querySelectorAll(".discussion-replies button")].find(b=>b.textContent.trim()==="Edit reply").click()',
    );
    await waitFor(
      () => evaluate('!!document.querySelector(".reply-edit-form")'),
      "reply editor",
    );
    const replyFixtureId = [...discussionReplies.keys()][0];
    discussionReplies.get(replyFixtureId).version++;
    await evaluate(
      '(()=>{const f=document.querySelector(".reply-edit-form"),b=f.querySelector("textarea");b.value="Preserved stale draft";b.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".game-discussions").textContent.includes("Reply changed or is unavailable.")',
        ),
      "reply conflict shown",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".reply-edit-form textarea").value',
      ),
      "Preserved stale draft",
    );
    await evaluate(
      '[...document.querySelectorAll(".reply-edit-form button")].find(b=>b.textContent.includes("Cancel")).click();[...document.querySelectorAll(".discussion-replies button")].find(b=>b.textContent.includes("Refresh replies")).click()',
    );
    await waitFor(
      () =>
        evaluate(
          '![...document.querySelectorAll(".discussion-replies button")].some(b=>b.disabled)',
        ),
      "reply reload complete",
    );
    await evaluate(
      '[...document.querySelectorAll(".discussion-replies button")].find(b=>b.textContent.trim()==="Edit reply").click()',
    );
    await evaluate(
      '(()=>{const f=document.querySelector(".reply-edit-form"),b=f.querySelector("textarea");b.value="Edited and saved reply";b.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(
      async () =>
        discussionReplies.get(replyFixtureId).body === "Edited and saved reply",
      "reply edit saved",
    );
    const threadFixtureId = [...discussionThreads.keys()][0];
    omitThreadFromList = true;
    await navigate(
      "/games/steam-100?discussion=" + threadFixtureId,
      ".discussion-replies",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".discussion-replies h3").textContent.includes("A fixture discussion")',
      ),
      true,
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".discussion-replies").textContent.includes("Edited and saved reply")',
        ),
      "direct link reply loaded",
    );
    await evaluate(
      '[...document.querySelectorAll(".discussion-replies button")].find(b=>b.textContent.trim()==="Report reply").click()',
    );
    await waitFor(
      () => evaluate('!!document.querySelector(".discussion-report-form")'),
      "reply report form",
    );
    await evaluate(
      '(()=>{const f=document.querySelector(".discussion-report-form"),r=f.querySelector("textarea");r.value="Fixture moderation reason";r.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(
      async () => discussionReports.size === 1,
      "reply report saved",
    );
    omitThreadFromList = false;
    fixtureRole = "ADMIN";
    await navigate(
      "/community?tab=Moderation",
      ".discussion-moderation article",
    );
    await evaluate(
      '(()=>{const input=document.querySelector(".discussion-moderation article input");input.value="Reviewed fixture content";input.dispatchEvent(new Event("input",{bubbles:true}));})()',
    );
    await waitFor(
      () =>
        evaluate(
          '!document.querySelector(".discussion-moderation article button").disabled',
        ),
      "moderation reason accepted",
    );
    await evaluate(
      'document.querySelector(".discussion-moderation article button").click()',
    );
    await waitFor(
      async () => discussionActions.length === 1,
      "moderation action recorded",
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".discussion-moderation").textContent.includes("Reviewed fixture content")',
        ),
      "moderation history shown",
    );
    fixtureRole = "USER";
    await navigate(
      "/games/steam-100?discussion=" + threadFixtureId,
      ".discussion-replies",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".discussion-replies").textContent.includes("Edited and saved reply")',
      ),
      false,
    );

    const removedThread = discussionThreads.get(threadFixtureId);
    discussionThreads.delete(threadFixtureId);
    await evaluate(
      '[...document.querySelectorAll(".discussion-replies button")].find(b=>b.textContent.includes("Refresh replies")).click()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".game-discussions").textContent.includes("Discussion unavailable.")&&!document.querySelector(".discussion-replies")',
        ),
      "unavailable direct thread clears stale replies",
    );
    discussionThreads.set(threadFixtureId, removedThread);
    discussionsEnabled = false;
    await navigate("/community?tab=Discussions", ".game-discussions");
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".game-discussions").textContent.includes("not enabled")',
        ),
      "disabled discussion message",
    );
    assert.equal(
      await evaluate('!!document.querySelector(".game-discussions form")'),
      false,
    );
    discussionsEnabled = true;
    await navigate("/games/steam-101", ".collection-controls button");
    await evaluate(
      '[...document.querySelectorAll(".collection-controls button")].find(b=>b.textContent.includes("Add to Library")).click()',
    );
    await waitFor(
      () => evaluate('!!document.querySelector(".collection-controls select")'),
      "second account game added",
    );
    const privateNoteBefore = accountEntries.get("steam-100").notes;
    await navigate("/library", ".library-entry-meta");
    await evaluate(
      '(async()=>{for(const input of document.querySelectorAll(".check-label input[type=checkbox]")){input.click();await new Promise(requestAnimationFrame);}const select=[...document.querySelectorAll("select")].find(el=>el.getAttribute("aria-label")==="Bulk playing status");select.value="On Hold";select.dispatchEvent(new Event("change",{bubbles:true}));window.confirm=()=>true;await new Promise(requestAnimationFrame);[...document.querySelectorAll("main button")].find(b=>b.textContent.includes("Update selected status")).click();})()',
    );
    await waitFor(
      async () =>
        bulkRequests === 1 &&
        [...accountEntries.values()].every((e) => e.status === "On Hold"),
      "single bulk status request",
    );
    assert.equal(accountEntries.get("steam-100").notes, privateNoteBefore);
    await navigate("/goals", ".goal-form");
    await evaluate(
      '{const form=document.querySelector(".goal-form"),title=form.querySelector("input");title.value="A private completion goal";title.dispatchEvent(new Event("input",{bubbles:true}));form.requestSubmit();}',
    );
    await waitFor(
      async () =>
        accountWorkspace.data.goals?.some(
          (g) => g.title === "A private completion goal",
        ),
      "private goal persisted",
    );
    await navigate("/goals", ".goal-card");
    await waitFor(
      () => evaluate('!!document.querySelector(".activity-calendar")'),
      "recorded activity calendar",
    );
    assert.match(
      await evaluate('document.querySelector(".goal-card").textContent'),
      /private completion goal/,
    );
    assert.match(
      await evaluate('document.querySelector(".private-timeline").textContent'),
      /recorded|Game added/i,
    );
    for (const width of [390, 320]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: true,
      });
      assert.equal(
        await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
        true,
        "goals overflow at " + width,
      );
    }
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate("/games/steam-100", ".history-card");
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".history-card").textContent.includes("No price observations yet")',
        ),
      "initial history empty state settled",
    );
    assert.match(
      await evaluate('document.querySelector(".history-card").textContent'),
      /No price observations yet/,
    );
    await evaluate(
      '[...document.querySelectorAll("main button")].find(b=>b.textContent.includes("Save current store observation")).click()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".history-card").textContent.includes("Latest stored quote")',
        ),
      "stored observation displayed",
    );
    assert.equal(savedPrices.get("steam-100").length, 1);
    await waitFor(
      () => evaluate('!!document.querySelector(".history-card canvas")'),
      "lazy price chart loaded",
    );
    holdWishlist = true;
    const wishlistBefore = wishlistWrites;
    await evaluate('{const button=[...document.querySelectorAll(".purchase-panel button")].find(b=>b.textContent.includes("Add to wishlist"));button.click();button.click();}');
    await waitFor(() => Promise.resolve(wishlistWrites>wishlistBefore), "pending wishlist write");
    await delay(100);
    assert.equal(wishlistWrites-wishlistBefore, 1, "duplicate wishlist starts are blocked");
    holdWishlist = false; while (wishlistReleases.length) wishlistReleases.shift()();
    await waitFor(() => evaluate('document.querySelector(".purchase-panel").textContent.includes("Saved to your wishlist")'), "wishlist acknowledgement");
    await evaluate('document.querySelector(".related-content > button").click()');
    await waitFor(() => evaluate('document.querySelector(".related-content").textContent.includes("Check this game")'), "unsupported related listing fallback");
    assert.equal(await evaluate('document.querySelector(".related-store-link").href'), games[0].storeUrl);
    detailMediaFixture = true; relatedFixture = true; holdRelatedEditions = true;
    failScreenshot = true;
    await navigate("/games/steam-100", ".game-media");
    await evaluate('document.querySelector(".screenshots").scrollIntoView()');
    await waitFor(() => evaluate('!!document.querySelector(".screenshots button")'), "failed screenshot request settled");
    assert.equal(await evaluate('[...document.querySelectorAll(".screenshots button")].some(b=>b.textContent.includes("Retry screenshot"))'), true, "failed screenshot has an explicit retry");
    assert.equal(await evaluate('document.querySelector(".screenshots [role=status]").textContent.includes("could not load")'), true);
    assert.equal(await evaluate('document.querySelector(".screenshots a").href'), "http://127.0.0.1:" + apiPort + "/fixture-screenshot.svg");
    failScreenshot = false;
    await evaluate('document.querySelector(".screenshots button").focus();document.querySelector(".screenshots button").click()');
    await waitFor(() => evaluate('document.querySelector(".screenshots img")?.naturalWidth>0'), "screenshot retry recovered the resource");
    assert.equal(await evaluate('document.activeElement===document.querySelector(".screenshots button")'), true, "screenshot retry preserves focus");
    assert.equal(await evaluate('document.querySelector(".game-media video").controls'), true);
    assert.equal(await evaluate('document.querySelector(".game-media video").preload'), "none");
    assert.equal(await evaluate('document.querySelector(".game-media video").getAttribute("aria-label")'), "Fixture gameplay trailer");
    await evaluate('document.querySelector(".game-media video").load()');
    await waitFor(() => evaluate('document.querySelector(".trailer-media [role=status]").textContent.includes("could not load")'), "real invalid trailer error");
    assert.equal(await evaluate('document.querySelector(".trailer-media a").textContent'), "Open Fixture gameplay trailer video");
    assert.equal(await evaluate('document.querySelector(".trailer-media a").getAttribute("rel")'), "noopener noreferrer");
    await evaluate('document.querySelector(".trailer-media button").focus();document.querySelector(".trailer-media button").click()');
    await waitFor(() => evaluate('document.querySelector(".trailer-media [role=status]").textContent.includes("could not load")'), "failed trailer retry remains recoverable");
    assert.equal(await evaluate('document.activeElement===document.querySelector(".trailer-media button")'), true, "trailer retry preserves focus");
    assert.equal(await evaluate('document.querySelector(".screenshots a").getAttribute("aria-label")'), "Open screenshot 1 in a new tab");
    assert.equal(await evaluate('document.querySelector(".screenshots img").alt'), "Fixture Game 0 screenshot 1");
    assert.equal(await evaluate('document.querySelector(".system-requirements").textContent.includes("<b>Literal requirement text</b>")'), true);
    assert.equal(await evaluate('!!document.querySelector(".system-requirements b")'), false);
    assert.equal(await evaluate('document.querySelector(".system-requirements").textContent.includes("Recommended requirements were not supplied")'), true);
    await evaluate('document.querySelector(".related-content > button").click()');
    await waitFor(() => Promise.resolve(!!releaseRelatedEditions), "held editions request");
    await evaluate('[...document.querySelectorAll(".related-tabs button")].find(b=>b.textContent.includes("DLC & add-ons")).click()');
    await waitFor(() => evaluate('document.querySelector(".related-list").textContent.includes("Fixture expansion")'), "DLC replacement list");
    holdRelatedEditions = false; releaseRelatedEditions(); releaseRelatedEditions = null;
    await delay(100);
    assert.equal(await evaluate('document.querySelectorAll(".related-list li").length'), 1);
    assert.equal(await evaluate('document.querySelector(".related-list").textContent.includes("Fixture edition")'), false, "late editions cannot replace DLC");
    await evaluate('[...document.querySelectorAll(".related-tabs button")].find(b=>b.textContent.includes("Other versions")).click()');
    await waitFor(() => evaluate('document.querySelectorAll(".related-list li").length===2'), "editions first page");
    failRelatedSecond = true;
    await evaluate('[...document.querySelectorAll(".related-content button")].find(b=>b.textContent.includes("Load more")).click()');
    await waitFor(() => evaluate('!!document.querySelector(".related-content [role=alert]")'), "editions later-page failure");
    assert.equal(await evaluate('document.querySelectorAll(".related-list li").length'), 2);
    failRelatedSecond = false;
    await evaluate('document.querySelector(".related-content [role=alert] button").click()');
    await waitFor(() => evaluate('document.querySelectorAll(".related-list li").length===3'), "editions retry and deduplication");
    assert.equal(await evaluate('document.querySelector(".related-content").textContent.includes("partial listing")'), true);
    const relatedReadsBeforeToggle = requests.filter(r=>r.includes("/related?")).length;
    await evaluate('document.querySelector(".related-content > button").focus()');
    assert.equal(await evaluate('document.activeElement===document.querySelector(".related-content > button")'), true);
    for (const state of [false, true]) {
      await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
      await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await waitFor(() => evaluate('document.querySelector(".related-content > button").getAttribute("aria-expanded")==="'+state+'"'), "related keyboard toggle " + state);
    }
    assert.equal(requests.filter(r=>r.includes("/related?")).length, relatedReadsBeforeToggle);
    for (const width of [320, 375, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "detail media/requirements/editions layout at " + width);
    }
    detailMediaFixture = false; relatedFixture = false;
    failHistory = true;
    await evaluate(
      '[...document.querySelectorAll(".history-card button")].find(b=>b.textContent.includes("Refresh history")).click()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".history-card").textContent.includes("Price history unavailable")',
        ),
      "price history outage isolated",
    );
    failHistory = false;
    await evaluate(
      '[...document.querySelectorAll(".history-card button")].find(b=>b.textContent.includes("Try again")).click()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".history-card").textContent.includes("Latest stored quote")',
        ),
      "price history retry",
    );

    await navigate("/games/steam-100", ".alert-form input");
    const alertsBeforeInvalid = fixtureAlerts.size;
    await evaluate('document.querySelector(".alert-form button").focus();document.querySelector(".alert-form button").click()');
    await waitFor(() => evaluate('document.querySelector(".alert-form input").getAttribute("aria-invalid")==="true"'), "required alert target feedback");
    assert.equal(await evaluate('document.activeElement===document.querySelector(".alert-form input")'), true, "invalid alert target receives focus");
    assert.equal(await evaluate('document.querySelector(".alert-form input").getAttribute("aria-describedby")'), "price-alert-hint price-alert-error");
    assert.equal(await evaluate('document.getElementById("price-alert-error").textContent.includes("positive target")'), true);
    await cdp("Input.insertText", { text: "-" });
    assert.equal(await evaluate('document.querySelector(".alert-form input").validity.badInput'), true);
    assert.equal(await evaluate('document.querySelector(".alert-form input").getAttribute("aria-invalid")'), "true");
    assert.equal(fixtureAlerts.size, alertsBeforeInvalid);
    for (const width of [320, 375, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "alert validation layout at " + width);
    }

    await evaluate(
      '(()=>{const input=document.querySelector(".alert-form input");input.value="85.25";input.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector(".alert-form button").click();})()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".alert-form").textContent.includes("Price alert saved.")',
        ),
      "alert created",
    );
    assert.equal(fixtureAlerts.size, 1);
    await evaluate('document.querySelector(".alert-form button").click()');
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".alert-form").textContent.includes("already saved")',
        ),
      "duplicate alert feedback",
    );
    assert.equal(fixtureAlerts.size, 1);
    fixtureAlerts.get("steam-100:85.25").active = false;
    await evaluate('document.querySelector(".alert-form button").click()');
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".alert-form").textContent.includes("paused")',
        ),
      "paused alert remains paused",
    );
    assert.equal(fixtureAlerts.get("steam-100:85.25").active, false);
    failAlertAfterCommit = true;
    await evaluate(
      '(()=>{const input=document.querySelector(".alert-form input");input.value="80";input.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector(".alert-form button").click();})()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".alert-form").textContent.includes("Simulated response failure")',
        ),
      "uncertain alert save shown",
    );
    await evaluate('document.querySelector(".alert-form button").click()');
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".alert-form").textContent.includes("already saved")',
        ),
      "uncertain alert retry reuses committed row",
    );
    assert.equal(fixtureAlerts.size, 2);

    await navigate("/account", ".alert-row");
    holdAlertMutation = true;
    await evaluate('document.querySelector(".alert-row button").click()');
    await waitFor(
      async () => !!releaseAlertMutation,
      "old alert mutation held",
    );
    await evaluate('document.querySelector(".auth-signout").click()');
    await waitFor(
      () => evaluate('!!document.querySelector("button.avatar")'),
      "sign out during alert mutation",
    );
    holdAlertRead = true;
    await evaluate('document.querySelector("button.avatar").click()');
    await waitFor(
      () => evaluate('!!document.querySelector(".auth-dialog form")'),
      "alert race sign in",
    );
    await evaluate(
      '(()=>{const f=document.querySelector(".auth-dialog form"),email=f.querySelector("input[type=email]"),password=f.querySelector("input[type=password]");email.value="fixture@example.invalid";email.dispatchEvent(new Event("input",{bubbles:true}));password.value="fixture-password";password.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(
      async () => !!releaseAlertRead,
      "new session alert load held",
    );
    releaseAlertMutation();
    releaseAlertMutation = null;
    holdAlertMutation = false;
    await delay(150);
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll(".account-page [role=status]")].some(el=>/Loading your price alerts|Updating price alerts/.test(el.textContent))',
      ),
      true,
      "old session mutation must not clear new session loading",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".account-page").textContent.includes("Alert resumed.")',
      ),
      false,
      "old session mutation must not announce in new session",
    );
    releaseAlertRead();
    releaseAlertRead = null;
    holdAlertRead = false;
    await waitFor(
      () => evaluate('!!document.querySelector(".alert-row")'),
      "new session alerts loaded",
    );

    failAlertRead = true;
    await navigate("/account", ".account-page .form-error");
    assert.equal(
      await evaluate(
        'document.querySelector(".account-page").textContent.includes("No alerts yet")',
      ),
      false,
      "alert load error must not claim empty account",
    );
    failAlertRead = false;
    await evaluate(
      '[...document.querySelectorAll(".account-page button")].find(b=>b.textContent.includes("Reload alerts")).click()',
    );
    await waitFor(
      () =>
        evaluate(
          '!!document.querySelector(".alert-row")&&!document.querySelector(".account-page .form-error")',
        ),
      "alert list retry",
    );
    historyEnabled = true;
    failHistoryPage = true;
    await navigate("/account", ".alert-delivery-history");
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".alert-delivery-history").textContent.includes("History fixture unavailable")',
        ),
      "history failure",
    );
    failHistoryPage = false;
    await evaluate(
      '[...document.querySelectorAll(".alert-delivery-history button")].find(b=>b.textContent.includes("Retry")).click()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".alert-delivery-history").textContent.includes("Delivered fixture game")',
        ),
      "history retry loaded",
    );
    await evaluate(
      '[...document.querySelectorAll(".alert-delivery-history button")].find(b=>b.textContent.includes("More alert history")).click()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelectorAll(".alert-delivery-history article").length===2',
        ),
      "history next page",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".alert-delivery-history").textContent.includes("notifications were disabled")',
      ),
      true,
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 320,
      height: 850,
      deviceScaleFactor: 1,
      mobile: true,
    });
    assert.equal(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
      true,
      "history mobile overflow",
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await navigate("/preferences", ".workspace-form");
    await waitFor(
      () =>
        evaluate('!document.querySelector(".workspace-form button").disabled'),
      "preferences ready",
    );
    holdWorkspaceSave = true;
    await evaluate(
      '(()=>{const f=document.querySelector(".workspace-form"),input=f.querySelector("input");input.value="First submitted name";input.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(async () => !!releaseWorkspaceSave, "preferences save held");
    await evaluate(
      '(()=>{const input=document.querySelector(".workspace-form input");input.value="My newer unsaved draft";input.dispatchEvent(new Event("input",{bubbles:true}));})()',
    );
    holdWorkspaceSave = false;
    releaseWorkspaceSave();
    releaseWorkspaceSave = null;
    await waitFor(
      () =>
        evaluate('!document.querySelector(".workspace-form button").disabled'),
      "older preferences save completed",
    );
    await evaluate(
      '[...document.querySelectorAll("main button")].find(b=>b.textContent.includes("Reset recommendation feedback")).click()',
    );
    await waitFor(
      async () =>
        Object.keys(
          accountWorkspace.data.preferences.recommendationFeedback ?? {},
        ).length === 0,
      "unrelated private feedback reset saved",
    );
    await waitFor(
      () =>
        evaluate('!document.querySelector(".workspace-form button").disabled'),
      "workspace reset completed",
    );
    assert.equal(
      await evaluate('document.querySelector(".workspace-form input").value'),
      "My newer unsaved draft",
      "older save must not mark newer edits clean and let another update overwrite them",
    );

    assert.equal(
      accountWorkspace.data.profile.name,
      "First submitted name",
      "newer unsaved profile must not be uploaded implicitly",
    );
    assert.equal(
      await evaluate('!!document.querySelector(".unsaved-preferences")'),
      true,
      "unsaved changes are explicit after earlier save",
    );
    await evaluate('document.querySelector(".workspace-form").requestSubmit()');
    await waitFor(
      async () =>
        accountWorkspace.data.profile.name === "My newer unsaved draft",
      "latest preferences explicitly saved",
    );
    await waitFor(
      () => evaluate('!document.querySelector(".unsaved-preferences")'),
      "latest draft clean after its own save",
    );
    await navigate("/preferences", ".workspace-form");
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".workspace-form input").value==="My newer unsaved draft"',
        ),
      "latest preferences survive reload",
    );

    await navigate("/library", ".library-entry-meta");
    holdLibraryBulk = true;
    await evaluate(
      '(async()=>{const boxes=[...document.querySelectorAll(".check-label input[type=checkbox]")];boxes[0].click();await new Promise(requestAnimationFrame);window.confirm=()=>true;[...document.querySelectorAll("main button")].find(b=>b.textContent.includes("Update selected status")).click();})()',
    );
    await waitFor(async () => !!releaseLibraryBulk, "bulk response held");
    await evaluate(
      'document.querySelectorAll(".check-label input[type=checkbox]")[1].click()',
    );
    holdLibraryBulk = false;
    releaseLibraryBulk();
    releaseLibraryBulk = null;
    await waitFor(
      () =>
        evaluate(
          '![...document.querySelectorAll(".storage-warning")].some(el=>el.textContent.includes("Saving account library"))',
        ),
      "bulk save complete",
    );
    assert.equal(
      await evaluate(
        'document.querySelectorAll(".check-label input[type=checkbox]")[1].checked',
      ),
      true,
      "bulk completion must preserve selections added while pending",
    );
    await evaluate('document.querySelector(".auth-signout").click()');
    await waitFor(
      () => evaluate('!!document.querySelector("button.avatar")'),
      "library sign out",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".collection-page").textContent.includes("0 selected")',
      ),
      true,
      "selection must reset for device context",
    );
    await evaluate('document.querySelector("button.avatar").click()');
    await waitFor(
      () => evaluate('!!document.querySelector(".auth-dialog form")'),
      "library sign in",
    );
    await evaluate(
      '(()=>{const f=document.querySelector(".auth-dialog form"),email=f.querySelector("input[type=email]"),password=f.querySelector("input[type=password]");email.value="fixture@example.invalid";email.dispatchEvent(new Event("input",{bubbles:true}));password.value="fixture-password";password.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(
      () =>
        evaluate(
          '!!document.querySelector(".auth-signout")&&!!document.querySelector(".library-entry-meta")&&!document.querySelector(".auth-dialog")',
        ),
      "library restored",
    );
    const journalFixtureId = "11111111-1111-4111-8111-111111111111";
    accountJournal.set(journalFixtureId, {
      id: journalFixtureId,
      game: games[0],
      kind: "session",
      date: "2026-11-05",
      minutes: 30,
      notes: "Journal workflow fixture",
      progress: "",
      tags: [],
      spoiler: false,
      rating: null,
      version: 0,
    });
    await navigate("/journal", ".journal-entry");
    await evaluate(
      '[...document.querySelectorAll(".journal-entry")].find(el=>el.textContent.includes("Journal workflow fixture")).querySelector("button").click()',
    );
    holdJournalWrite = true;
    await evaluate(
      '(()=>{const f=document.querySelector("#journal-form"),notes=f.querySelector("textarea");notes.value="Saved journal workflow edit";notes.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(async () => !!releaseJournalWrite, "journal write held");
    assert.equal(
      await evaluate(
        'document.querySelector("#journal-form textarea").matches(":disabled")',
      ),
      true,
      "pending journal fields must not accept edits that completion would erase",
    );
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll(".journal-entry button")].every(b=>b.disabled)',
      ),
      true,
      "entry changes disabled while pending write",
    );
    holdJournalWrite = false;
    releaseJournalWrite();
    releaseJournalWrite = null;
    await waitFor(
      () =>
        evaluate(
          '!document.querySelector("#journal-form button").disabled&&document.querySelector("#journal-form textarea").value===""',
        ),
      "journal save acknowledged",
    );
    await evaluate(
      '[...document.querySelectorAll(".journal-entry")].find(el=>el.textContent.includes("Saved journal workflow edit")).querySelector("button").click()',
    );
    await evaluate(
      '(()=>{window.confirm=()=>true;const buttons=[...document.querySelectorAll(".journal-entry")].find(el=>el.textContent.includes("Saved journal workflow edit")).querySelectorAll("button");buttons[1].click();})()',
    );
    await waitFor(
      async () => !accountJournal.has(journalFixtureId),
      "edited journal entry deleted",
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector("#journal-form h2").textContent.includes("Record a moment")',
        ),
      "deleted editor reset",
    );

    await navigate("/games/steam-100", ".review-card");
    await evaluate(
      '[...document.querySelectorAll(".review-card button")].find(b=>b.textContent.includes("Report review")).click()',
    );
    await waitFor(
      () => evaluate('!!document.querySelector(".review-card form")'),
      "review report editor",
    );
    failReviewReport = true;
    await evaluate(
      '(()=>{const f=document.querySelector(".review-card form"),input=f.querySelector("textarea");input.value="Keep my report reason after failure";input.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".community-reviews").textContent.includes("Report service unavailable")',
        ),
      "review report failure",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".review-card form textarea")?.value',
      ),
      "Keep my report reason after failure",
      "failed report must retain its reason",
    );
    await editorLayout("review report/editor");
    failReviewReport = false;
    await evaluate(
      'document.querySelector(".review-card form").requestSubmit()',
    );
    await waitFor(
      () =>
        evaluate(
          '!document.querySelector(".review-card form")&&!document.querySelector(".community-reviews form.social-form fieldset").disabled&&document.querySelector(".community-reviews").textContent.includes("Report submitted")',
        ),
      "report retry confirmed",
    );

    await evaluate(
      '(()=>{const f=document.querySelector(".community-reviews form.social-form"),title=f.querySelector("input"),body=f.querySelector("textarea");title.value="Kept duplicate review draft";title.dispatchEvent(new Event("input",{bubbles:true}));body.value="Do not erase my replacement body";body.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(
      () =>
        evaluate(
          '!document.querySelector(".community-reviews form.social-form fieldset").disabled&&document.querySelector(".community-reviews").textContent.includes("Your draft is kept")',
        ),
      "duplicate review retains draft",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".community-reviews form.social-form textarea").value',
      ),
      "Do not erase my replacement body",
    );
    const reviewId = [...socialReviews.keys()][0];
    socialReviews.get(reviewId).version++;
    await evaluate(
      'document.querySelector(".community-reviews form.social-form").requestSubmit()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".community-reviews .form-error").textContent.includes("Your draft is kept")',
        ),
      "review version conflict",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".community-reviews form.social-form textarea").value',
      ),
      "Do not erase my replacement body",
    );
    await evaluate(
      '[...document.querySelectorAll(".community-reviews .form-error button")].find(b=>b.textContent.includes("Reload reviews")).click()',
    );
    await waitFor(
      () =>
        evaluate(
          '![...document.querySelectorAll(".review-card button")].find(b=>b.textContent.includes("Edit review")).disabled',
        ),
      "review latest list loaded",
    );
    await evaluate(
      '[...document.querySelectorAll(".review-card button")].find(b=>b.textContent.includes("Edit review")).click()',
    );
    await evaluate(
      '(()=>{const f=document.querySelector(".community-reviews form.social-form"),body=f.querySelector("textarea");body.value="Resolved review edit";body.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(
      async () => socialReviews.get(reviewId).body === "Resolved review edit",
      "explicit latest-version review save",
    );
    await navigate("/community/collections/new", ".social-form");
    await evaluate(
      '(()=>{const input=document.querySelector(".social-form input");input.value="Previous session private draft";input.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector(".auth-signout").click();})()',
    );
    await waitFor(
      () => evaluate('!!document.querySelector("button.avatar")'),
      "collection draft sign out",
    );
    await evaluate('document.querySelector("button.avatar").click()');
    await waitFor(
      () => evaluate('!!document.querySelector(".auth-dialog form")'),
      "collection draft sign in",
    );
    await evaluate(
      '(()=>{const f=document.querySelector(".auth-dialog form"),email=f.querySelector("input[type=email]"),password=f.querySelector("input[type=password]");email.value="fixture@example.invalid";email.dispatchEvent(new Event("input",{bubbles:true}));password.value="fixture-password";password.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(
      () =>
        evaluate(
          '!!document.querySelector(".social-page .social-form input")&&!document.querySelector(".auth-dialog")',
        ),
      "collection form in new session",
    );
    assert.equal(
      await evaluate(
        'document.querySelector(".social-page .social-form input").value',
      ),
      "",
      "collection draft must reset across sessions",
    );

    const collectionId = [...socialCollections.keys()][0];
    await navigate(
      "/community/collections/" + collectionId,
      ".social-game-grid",
    );
    await evaluate(
      '[...document.querySelectorAll(".social-page button")].find(b=>b.textContent.includes("Edit collection")).click()',
    );
    await waitFor(
      () => evaluate('!!document.querySelector("form.social-form input")'),
      "collection editor opened",
    );
    await evaluate(
      '(()=>{const input=document.querySelector("form.social-form input");input.value="Keep collection conflict draft";input.dispatchEvent(new Event("input",{bubbles:true}));})()',
    );
    socialCollections.get(collectionId).version++;
    socialCollections.get(collectionId).name = "Collection updated elsewhere";
    await evaluate(
      'document.querySelector("form.social-form").requestSubmit()',
    );
    await waitFor(
      () =>
        evaluate(
          'document.querySelector(".social-page .form-error").textContent.includes("Your draft is kept")',
        ),
      "collection version conflict",
    );
    assert.equal(
      await evaluate('document.querySelector("form.social-form input").value'),
      "Keep collection conflict draft",
    );
    await editorLayout("collection conflict editor");
    await evaluate(
      'window.confirm=()=>false;document.querySelector(".social-page .form-error button").click()',
    );
    assert.equal(
      await evaluate('document.querySelector("form.social-form input").value'),
      "Keep collection conflict draft",
      "declining reload retains draft",
    );
    await evaluate(
      'window.confirm=()=>true;document.querySelector(".social-page .form-error button").click()',
    );
    await waitFor(
      () =>
        evaluate(
          '!document.querySelector("form.social-form")&&document.querySelector("h1").textContent.includes("Collection updated elsewhere")',
        ),
      "explicit collection reload",
    );
    await evaluate(
      '[...document.querySelectorAll(".social-page button")].find(b=>b.textContent.includes("Edit collection")).click()',
    );
    holdCollectionWrite = true;
    await evaluate(
      '(()=>{const f=document.querySelector("form.social-form"),input=f.querySelector("input");input.value="Recovered collection edit";input.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(
      async () => !!releaseCollectionWrite,
      "collection save response held",
    );
    assert.equal(
      await evaluate(
        'document.querySelector("form.social-form input").matches(":disabled")',
      ),
      true,
      "pending collection fields",
    );
    holdCollectionWrite = false;
    releaseCollectionWrite();
    releaseCollectionWrite = null;
    await waitFor(
      () =>
        evaluate(
          '!document.querySelector("form.social-form")&&document.querySelector("h1").textContent.includes("Recovered collection edit")',
        ),
      "collection conflict recovered",
    );
    await navigate("/community/collections/new", "form.social-form");
    holdCollectionWrite = true;
    await evaluate(
      '(()=>{const f=document.querySelector("form.social-form"),input=f.querySelector("input");input.value="Committed without redirecting away";input.dispatchEvent(new Event("input",{bubbles:true}));f.requestSubmit();})()',
    );
    await waitFor(
      async () => !!releaseCollectionWrite,
      "late publication response held",
    );
    await evaluate('document.querySelector(".social-page > a").click()');
    await waitFor(
      () =>
        evaluate(
          'location.pathname==="/community"&&!!document.querySelector(".social-tabs")',
        ),
      "SPA navigation away from pending publication",
    );
    holdCollectionWrite = false;
    releaseCollectionWrite();
    releaseCollectionWrite = null;
    await delay(150);
    assert.equal(
      await evaluate("location.pathname"),
      "/community",
      "late saved publication must not hijack navigation",
    );
    const originalDeviceText = "Invalid original device backup ? private fixture";
    await evaluate('localStorage.removeItem("gamevault_token");localStorage.setItem("gamevault_library_v1",'+JSON.stringify(originalDeviceText)+')');
    await navigate("/catalogue", ".storage-warning");
    await waitFor(() => evaluate('[...document.querySelectorAll(".storage-warning button")].some(b=>b.textContent.includes("Download original device data"))'), "device recovery controls");
    assert.equal(await evaluate('localStorage.getItem("gamevault_library_v1")'), originalDeviceText);
    await waitFor(() => evaluate('document.querySelectorAll(".game-card-shell .card-actions button").length>0'), "catalogue cards with protected device storage");
    assert.equal(await evaluate('[...document.querySelectorAll(".game-card-shell .card-actions button")].every(b=>b.disabled)'), true);
    await evaluate('window.__deviceDownload=null;HTMLAnchorElement.prototype.click=function(){window.__deviceDownload={url:this.href,name:this.download};};[...document.querySelectorAll(".storage-warning button")].find(b=>b.textContent.includes("Download original device data")).click();');
    await waitFor(() => evaluate('!!window.__deviceDownload'), "original device download");
    assert.equal(await evaluate('fetch(window.__deviceDownload.url).then(r=>r.text())'), originalDeviceText);
    assert.equal(await evaluate('window.__deviceDownload.name'), "gamevault-device-library-original.txt");
    const repairedDevice = JSON.stringify([{ game: games[0], status: "Want to Play", favorite: false, rating: null, hours: 0, notes: "Recovered device fixture", addedAt: "2026-01-01T00:00:00.000Z" }]);
    await evaluate('localStorage.setItem("gamevault_library_v1",'+JSON.stringify(repairedDevice)+');[...document.querySelectorAll(".storage-warning button")].find(b=>b.textContent.includes("Retry device data")).click();');
    await waitFor(() => evaluate('![...document.querySelectorAll(".storage-warning button")].some(b=>b.textContent.includes("Retry device data"))'), "repaired device read");
    await navigate("/library", ".game-card");
    assert.equal(await evaluate('document.querySelectorAll(".game-card").length'), 1);
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("gamevault_library_v1"))[0].notes'), "Recovered device fixture");
    const invalidWorkspaceText = JSON.stringify({ ...emptyWorkspace(), preferences: { genres: null, platforms: [] } });
    await evaluate('localStorage.setItem("gamevault_workspace_v1",'+JSON.stringify(invalidWorkspaceText)+')');
    await navigate("/preferences", ".workspace-recovery");
    assert.equal(await evaluate('document.querySelector(".workspace-form button").disabled'), true, "invalid device workspace is protected");
    assert.equal(await evaluate('localStorage.getItem("gamevault_workspace_v1")'), invalidWorkspaceText);
    await evaluate('window.__workspaceDownload=null;HTMLAnchorElement.prototype.click=function(){window.__workspaceDownload={url:this.href,name:this.download};};[...document.querySelectorAll(".workspace-recovery button")].find(b=>b.textContent.includes("Download original workspace data")).click();');
    await waitFor(() => evaluate('!!window.__workspaceDownload'), "original workspace download");
    assert.equal(await evaluate('fetch(window.__workspaceDownload.url).then(r=>r.text())'), invalidWorkspaceText);
    assert.equal(await evaluate('window.__workspaceDownload.name'), "gamevault-device-workspace-original.txt");
    for (const width of [320, 375, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "workspace recovery layout at " + width);
    }
    await navigate("/wrapped", ".workspace-recovery");
    assert.equal(await evaluate('!!document.querySelector(".dashboard-stats")'), false, "invalid workspace cannot appear as zero annual activity");
    await navigate("/preferences", ".workspace-recovery");
    const repairedWorkspace = { ...emptyWorkspace(), profile: { name: "Repaired device workspace", bio: "" } };
    await evaluate('localStorage.setItem("gamevault_workspace_v1",'+JSON.stringify(JSON.stringify(repairedWorkspace))+');[...document.querySelectorAll(".workspace-recovery button")].find(b=>b.textContent.includes("Retry device workspace")).click();');
    await waitFor(() => evaluate('!document.querySelector(".workspace-recovery")&&document.querySelector(".workspace-form input").value==="Repaired device workspace"'), "reread repaired workspace");
    assert.equal(await evaluate('document.querySelector(".workspace-form button").disabled'), false);
    await navigate("/", ".hero h1");
    await delay(250);
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    const shotPath = path.join(os.tmpdir(), "gamevault-redesign-desktop.png");
    fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
    console.log("Visual screenshot: " + shotPath);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: complete account/device JSON exports, retry/duplicate/focus/stale-file protection; nested workspace rejection/download/reread and unavailable analytics; original device backup download/protected edits/repair; screenshot recovery, trailer source-error retry/focus and linked alert validation; wishlist pending guard, editions/DLC retry/stale pages/keyboard cache and media/requirements semantics; multi-store capability resets and late provider success/error isolation; zero/year/invalid filter semantics, incomplete numeric reset, AX names and keyboard focus; lucky combined filters and invalidation, catalogue debounce/stale reads/page retry/deduplication/genre navigation; independent annual summary retry; review/collection conflicts, draft isolation and late redirect; review-report retry and collection draft isolation; journal editing lifecycle and library selection; preferences pending-save drafts/reload and alert error/retry; account-alert session loading race; themed primary contrast, cover fallback and cancelled pending auth; private alert-history error/retry/pagination/mobile; duplicate/paused/uncertain-retry price alerts; discussion reply edits/conflicts/direct links/unavailable privacy clearing/report moderation history/disabled capability; social profile publishing/review spoilers and escaping/likes/shared collections/inbox and responsive social routes; normalized journal pagination/search/import/review CRUD and summaries; collections/journal/spoiler/picker/comparison/watchlist/PNG and 15 responsive routes; multi-store deal pagination/filter/custom budget; account sign-in/import/save/refresh/sign-out plus guest add/favorite/journal/persistence/dashboard/removal, search empty and retry, mobile menu, dialog keyboard, and 7 routes at 1920/1440/1024/768/390/375/320px.",
    );
  } catch (error) {
    console.error(
      "Browser diagnostics:",
      await evaluate(
        'JSON.stringify({url:location.href,ready:document.readyState,html:document.documentElement.outerHTML.slice(0,2500),resources:performance.getEntriesByType("resource").map(r=>r.name)})',
      ).catch(() => ""),
      errors,
      requests,
    );
    throw error;
  } finally {
    if (ws) {
      try {
        await Promise.race([cdp("Browser.close"), delay(1000)]);
      } catch {}
      ws.close();
    }
    edge.kill();
    vite.kill();
    if (releasePrivateExport) releasePrivateExport();
    if (releaseRelatedEditions) releaseRelatedEditions();
    while (wishlistReleases.length) wishlistReleases.shift()();
    if (releaseCatalogueRead) releaseCatalogueRead();
    if (releaseCollectionWrite) releaseCollectionWrite();
    if (releaseLibraryBulk) releaseLibraryBulk();
    if (releaseJournalWrite) releaseJournalWrite();
    if (releaseWorkspaceSave) releaseWorkspaceSave();
    if (releaseAlertMutation) releaseAlertMutation();
    if (releaseAlertRead) releaseAlertRead();
    api.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
