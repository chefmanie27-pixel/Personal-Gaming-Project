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
  let failNextJournalCreateAfterCommit = false;
  const accountEntries = new Map();
  let bulkRequests = 0;
  let socialProfile = null;
  let fixtureRole = "USER",
    discussionsEnabled = true,
    omitThreadFromList = false;
  const discussionReports = new Map(),
    discussionActions = [];
  const discussionThreads = new Map(),
    discussionReplies = new Map();
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
  const fixtureAlerts = new Map();
  let failAlertAfterCommit = false;
  const savedPrices = new Map();
  let failHistory = false;
  let failGames = false;
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
          } else
            result = { data: [...socialReviews.values()], nextOffset: null };
        } else if (p.startsWith("/api/social/reviews/")) {
          const id = p.split("/")[4],
            r = socialReviews.get(id);
          if (p.endsWith("/like")) {
            r.liked = m === "POST";
            r.likes = r.liked ? 1 : 0;
          } else if (m === "PATCH")
            socialReviews.set(id, { ...r, ...v, version: r.version + 1 });
          else if (m === "DELETE") socialReviews.delete(id);
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
          if (m === "PATCH")
            socialCollections.set(id, {
              ...socialCollections.get(id),
              ...v,
              version: v.version + 1,
            });
          else if (m === "DELETE") socialCollections.delete(id);
          result = { data: socialCollections.get(id) };
        }
        res.end(JSON.stringify(result));
      });
      return;
    }
    if (
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
        if (req.url.startsWith("/api/journal")) {
          const target = journalUrl.pathname;
          if (target === "/api/journal/summary") {
            const year = journalUrl.searchParams.get("year");
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
          } else result = { data: [...fixtureAlerts.values()] };
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
        } else if (req.url === "/api/auth/login")
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
        else if (req.url === "/api/auth/me")
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
        res.end(JSON.stringify(result));
      });
      return;
    }
    const url = new URL(req.url, "http://localhost");
    requests.push(url.pathname + url.search);
    let body;
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
        ],
      };
    else if (url.pathname === "/api/games") {
      if (failGames) {
        res.statusCode = 502;
        body = { error: "Test storefront unavailable" };
      } else {
        const query = (url.searchParams.get("search") ?? "").toLowerCase();
        const genre = url.searchParams.get("genre");
        const data = games.filter(
          (g) =>
            g.title.toLowerCase().includes(query) &&
            (!genre || g.genres.includes(genre)),
        );
        body = {
          data,
          meta: {
            total: data.length,
            page: 1,
            pages: 1,
            limit: 24,
            hasMore: false,
            scope: "Test feed",
          },
        };
      }
    } else if (/\/related$/.test(url.pathname))
      body = {
        data: [],
        meta: {
          supported: false,
          partial: false,
          hasMore: false,
          storeUrl: games[0].storeUrl,
        },
      };
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
        data:
          games.find((g) => g.slug === url.pathname.split("/").pop()) ??
          games[0],
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
  async function navigate(route, selector) {
    await cdp("Page.navigate", { url: origin + route });
    await waitFor(
      () =>
        evaluate("!!document.querySelector(" + JSON.stringify(selector) + ")"),
      route,
    );
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
    for (const width of [1440, 1024, 768, 390, 320]) {
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
    for (const width of [1440, 1024, 768, 390, 320]) {
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
    await navigate("/wrapped", ".dashboard-stats");
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
    for (const width of [1440, 768, 390, 320]) {
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
    await navigate("/", ".hero h1");
    await delay(250);
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    const shotPath = path.join(os.tmpdir(), "gamevault-redesign-desktop.png");
    fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
    console.log("Visual screenshot: " + shotPath);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: private alert-history error/retry/pagination/mobile; duplicate/paused/uncertain-retry price alerts; discussion reply edits/conflicts/direct links/unavailable privacy clearing/report moderation history/disabled capability; social profile publishing/review spoilers and escaping/likes/shared collections/inbox and responsive social routes; normalized journal pagination/search/import/review CRUD and summaries; collections/journal/spoiler/picker/comparison/watchlist/PNG and 15 responsive routes; multi-store deal pagination/filter/custom budget; account sign-in/import/save/refresh/sign-out plus guest add/favorite/journal/persistence/dashboard/removal, search empty and retry, mobile menu, dialog keyboard, and 7 routes at 1440/1024/768/390/320px.",
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
    api.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
