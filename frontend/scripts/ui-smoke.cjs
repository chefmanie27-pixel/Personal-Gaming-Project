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
      req.url.startsWith("/api/journal") ||
      req.url.startsWith("/api/workspace") ||
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
                role: "USER",
              },
            },
          };
        else if (req.url === "/api/auth/me")
          result = {
            data: {
              id: "fixture-user",
              email: "fixture@example.invalid",
              role: "USER",
            },
          };
        else if (req.url === "/api/library/import") {
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
    else if (/\/price-history$/.test(url.pathname))
      body = { data: [], meta: { sourceType: "steam", currency: "ZAR" } };
    else if (url.pathname.startsWith("/api/games/"))
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
      "flex",
    );
    await evaluate(
      '[...document.querySelectorAll(".main-nav a")].find(a=>a.pathname==="/library").click()',
    );
    await waitFor(
      () => evaluate('location.pathname==="/library"'),
      "mobile navigation",
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
    await navigate("/", ".hero h1");
    await delay(250);
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    const shotPath = path.join(os.tmpdir(), "gamevault-redesign-desktop.png");
    fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
    console.log("Visual screenshot: " + shotPath);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: normalized journal pagination/search/import/review CRUD and summaries; collections/journal/spoiler/picker/comparison/watchlist/PNG and 15 responsive routes; multi-store deal pagination/filter/custom budget; account sign-in/import/save/refresh/sign-out plus guest add/favorite/journal/persistence/dashboard/removal, search empty and retry, mobile menu, dialog keyboard, and 7 routes at 1440/1024/768/390/320px.",
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
