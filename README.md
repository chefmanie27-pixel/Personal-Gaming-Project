# Personal-Gaming-Project

# GameVault

GameVault is planned as a modern game discovery and price-tracking platform. It will combine searchable game metadata, attributed review summaries, storefront price comparisons, price history, deals, and user wishlists in a cinematic, mobile-first interface.

The repository now contains the first working vertical slice. External provider integrations, authentication, Prisma/MySQL persistence, and real prices remain intentionally deferred until their access terms and local infrastructure are confirmed. The implementation plan is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Recommended architecture

- **Frontend:** Vue 3 with Composition API, Vite, TypeScript, Vue Router, Pinia, Tailwind CSS, Axios, and Chart.js.
- **Backend:** Node.js, Express, and TypeScript. The backend owns provider credentials, normalization, caching, rate limiting, scheduled synchronization, authentication, and the REST API.
- **Persistence:** MySQL accessed through Prisma migrations. Provider identifiers and regional/storefront records are kept separate from canonical game records.
- **Integration boundary:** Each provider is implemented behind a small adapter interface so metadata, reviews, and prices can be replaced without rewriting controllers or UI code.
- **Deployment shape:** A frontend static build, a separately deployable API, and a managed MySQL instance. Background synchronization runs as a worker or scheduled process rather than in browser requests.

## Data-source position

- **Metadata:** Start with RAWG for a fast MVP, or IGDB if Twitch developer credentials and its non-commercial terms fit the intended use. The provider must remain replaceable.
- **Steam:** Use official Steam Web API/public store endpoints only for Steam-related metadata and user-review summaries where the endpoint and terms permit it.
- **Pricing:** IsThereAnyDeal is the most realistic aggregation candidate, but its API terms prohibit creating a competing service and require preserving supplied data/affiliate URLs. We must obtain approval and confirm GameVault is permitted before relying on it. Otherwise start with a single directly supported storefront and add providers one at a time.
- **Professional reviews:** Store source, score, URL, publication date, and attribution. Do not copy full review text or scrape protected pages. OpenCritic/Metacritic access must be verified with the provider before implementation; unavailable sources are omitted, never fabricated.

## Local development

Prerequisites:

- Node.js 20 or newer
- npm 10 or newer

Install workspace dependencies from the repository root:

```bash
npm install
```

For the persistence/authentication slice, create a MySQL database matching `backend/.env`, then run:

```bash
cd backend
copy .env.example .env
npm run db:generate
npm run db:migrate -- --name init
npx prisma db seed
cd ..
```

Start the frontend and backend together:

```bash
npm run dev
```

The frontend runs at `http://localhost:5173` and the API runs at `http://localhost:3000`. The API health check is available at `http://localhost:3000/api/health`.

Build and type-check both workspaces:

```bash
npm run typecheck
npm run build
```

The catalogue loads real games from Steam Store endpoints. Authentication and wishlist persistence are now database-backed once MySQL is configured. Required secrets use environment variables and documented `.env.example` files; no API keys are committed.

The Deals page is available at `/deals`, and game details include a Chart.js price-history view. Deals combine verified ZAR discounts from Steam, GOG, Xbox Console/PC, Nintendo and Epic. Price history remains empty until genuine observations have been stored. Stored `RegionalPrice` observations automatically take precedence when available.

Administrators can use `/admin` to inspect database counts and synchronization logs. The default mock synchronization is safe for development; RAWG, IGDB, and Steam jobs intentionally return a configuration error until credentials, terms, and adapters are enabled.

The RAWG adapter is now implemented behind the backend integration boundary. Add `RAWG_API_KEY` only after confirming the applicable API licence and usage terms; provider responses must still be normalized and persisted through a synchronization job.

Signed-in users can manage price alerts at `/account`. The scheduler evaluates active alerts every 15 minutes against the latest stored regional observation and records trigger times; email/push delivery is intentionally not enabled yet.

## Project status

See [docs/ROADMAP.md](docs/ROADMAP.md) for the MVP boundary, proposed database model, implementation phases, risks, and the next approval point.
## Live Steam catalogue

Catalogue, search, details and deals now use Steam Store public JSON endpoints with South African (cc=za) ZAR prices. No API key is needed. Run npm run dev. Outbound HTTPS access to store.steampowered.com is required. Responses are cached in memory for ten minutes, with request timeouts and shared in-flight requests. Featured browsing covers Steam featured collections; search uses Steam search results, not a complete local database.

Missing prices display as unavailable. Scores come from Metacritic where supplied by Steam. Price history only includes stored non-mock observations. The live-read integration does not yet persist games or listings for database-backed wishlists and alerts. Older development seeds and admin mock jobs are separate from the public catalogue. Public Steam endpoints may change or rate-limit requests.

## Expanded discovery

Catalogue pages read paginated Steam search results and append games while scrolling, with Load more/retry controls. Steam filters apply to each page; source totals describe the unfiltered query. Feeling lucky samples up to 72 games across three rotating pages and applies actual Metacritic and ZAR price filters.

Steam sign-in uses verified OpenID, a browser-bound expiring state, and a single-use exchange code. Configure PUBLIC_API_ORIGIN and FRONTEND_ORIGIN to your public origins (HTTPS in production). MySQL is required. Steam accounts are separate accounts identified by Steam ID; Steam does not supply an email address. Login state and exchange codes are process-local; multiple API instances require shared storage/sticky sessions.

Set RAWG_API_KEY to enable PC/PlayStation/Xbox/Nintendo metadata and outbound storefront links, subject to RAWG licensing and attribution requirements (https://rawg.io/apidocs). Regional console prices and direct console-store scraping are not implemented.

Verification: `npm run typecheck`, `npm run build`, and `npm test --workspace backend`. Live Steam checks verify distinct pages, price/score filters, and high-resolution artwork. A real Steam login still requires browser sign-in and working MySQL; live RAWG verification requires an API key.

## Direct storefront browsing (no API keys)

The catalogue now offers direct feeds independently of RAWG:

| Source | Coverage | ZAR prices | Metacritic |
| --- | --- | --- | --- |
| Steam | Regional search catalogue | When supplied | When supplied |
| GOG | Paginated PC game catalogue and product details | When supplied | Unavailable |
| Xbox | Microsoft public search restricted to Xbox | Unavailable | Unavailable |
| Nintendo | Nintendo UK game metadata, including legacy systems | Unavailable | Unavailable |
| Epic | Base games in the current promotions feed, including upcoming offers | When supplied | Unavailable |
| PlayStation | Official storefront link only | Unavailable | Unavailable |

All six storefronts have official outbound links. PlayStation's public browse page did not provide game records and its API requires whitelisted queries; its live catalogue is marked unavailable. Epic's full catalogue endpoint returned a browser security challenge; only the accessible promotions feed is used. Neither limited source is labelled a full catalogue. No browser challenges are bypassed. RAWG remains optional and can add PC/console metadata after a key is configured.

Public feeds use bounded five-minute caching, shared in-flight requests, timeouts and response validation. Non-ZAR and unknown prices stay unavailable. Xbox subscription/trial zero-price records are not used as retail prices. GOG product details fetch actual descriptions and ZAR prices and preserve catalogue cover art.

Feeling lucky now supports the enabled sources and platform filters. It samples at most 72 games from up to three of the first 20 source pages; unavailable price/score/genre controls are disabled. Native source totals describe provider results before local filters.

Browser verification: a hidden Edge session with an isolated temporary profile verified all six storefront cards, GOG/Xbox/Nintendo/Epic source switching, GOG descriptions and outbound links, the limited Epic coverage label, and Epic lucky picks with unsupported score inputs disabled. Live checks also verified pagination, game descriptions, cover URLs, and genre filters. PlayStation live catalogue access and Epic full-catalogue ingestion remain unavailable; Nintendo data is UK metadata and Xbox/Nintendo retail prices are not provided.


## Xbox PC and subscription comparison

Xbox PC is a separate catalogue source from Xbox Console. Its Microsoft search uses platformDependencyName=Windows.Desktop and its game URLs use xboxpc- IDs, so the same product's console listing cannot overwrite its PC platform label. Xbox PC also works in the lucky picker.

The /subscriptions page and GET /api/subscriptions compare South African plans with platform and billing-period filters. Microsoft-hosted Game Pass, EA Play (Xbox), and Ubisoft+ Premium monthly prices are read from their official en-ZA product pages and cached for 15 minutes. The parser validates the plan heading, excludes upsell sections, and uses the regular recurring price rather than a trial amount. Failed or ambiguous reads return an unconfirmed price.

PlayStation Plus Essential, Extra and Deluxe have explicitly labelled reference prices checked on 30 October 2026, for 1, 3 and 12 months. Their source is https://www.playstation.com/en-za/ps-plus/whats-new/ . These are reference snapshots, not live checkout quotes; edit the reference values/date in backend/src/integrations/subscriptions.ts after verifying a change. Nintendo South African membership prices and standalone EA Play PC prices could not be verified from accessible public sources, so these plans link to the provider with no invented or foreign-currency amount. Annual totals are labelled as yearly charges, not monthly bills.

## PC system requirements

PC game details now display minimum and recommended requirements grouped by operating system. Steam supplies Windows/macOS/Linux requirement blocks; GOG supplies structured OS-specific requirements from its v2 game endpoint; Xbox PC supplies Microsoft Store requirements. The optional RAWG adapter also reads desktop requirements when supplied. Epic's promotions feed does not provide these specifications.

Requirements are normalized to plain text and rendered using Vue text interpolation, never storefront HTML. Missing tiers remain missing, empty placeholders are omitted, and Microsoft device-availability labels are not treated as hardware specs. Optional requirements requests use the existing provider cache/timeouts and do not prevent game details from loading if the requirements source fails. Console-only listings exclude the PC section.

Verification includes 23 backend regression tests, a successful production build, live Steam/GOG/Xbox PC requirement reads, and hidden-browser checks for two-column desktop and stacked mobile layouts, source links, missing requirements, and console exclusion.

## Editions and DLC

Game details include an expandable Editions & DLC panel, loaded only when opened. GET /api/games/:slug/related accepts kind=editions or kind=dlc, page, and a bounded limit. Steam lists official purchase options, bundles from its purchase area, and linked DLC; GOG lists explicit editions and DLC, including DLC reached through a pack's included base-game relationships. Xbox/Xbox PC show the public add-on preview when supplied. Other storefronts and unsupported edition feeds link to the game's official store page.

Related products open their actual storefront pages, including DLC that cannot be opened as a base game in GameVault. Lists use provider IDs rather than title guesses. Partial feeds are labelled, DLC pages can load more results, and source failures have their own retry control. No related-product database migration is required for this live view.


## Discovery redesign and personal collection

The Vue frontend now uses a shared dark palette, responsive navigation, searchable local history, keyboard-accessible sign-in, featured-game selection, scrollable discovery rows, genre links, and storefront badges. Route components are loaded on demand. External Google font CSS is no longer required to render the application; system fonts provide the fallback. Discovery sections use available source data and omit empty categories rather than inventing ratings or release information.

Game cards add games to the signed-in account collection, or to a device collection for guests, and toggle favorites. The game journal records one of five playing statuses, a 0-10 personal rating, nonnegative playtime hours, and notes. My Library supports search, status filtering, sorting and grid/list views; Favorites and Dashboard read the same stored collection. Removal requires an inline confirmation. Statistics and genre counts are computed from actual saved entries.

**Persistence scope:** signed-in collections and journals are saved in MySQL through authenticated /api/library endpoints. Guest collections remain in browser localStorage under gamevault_library_v1. Signing in loads only that user's account entries; signing out restores the separate device collection. A stored sign-in token blocks device editing while identity is being verified. Device entries are never uploaded automatically. My Library offers an explicit import that retains existing account entries and keeps the device backup. Import batches are transactional and limited to 25 entries. Failed account reads or uncertain saves block further account edits until reload. Existing account wishlists, Steam authentication and price alerts remain separate features.

Catalogue year, minimum score, developer and alphabetical filters explicitly operate on loaded results; existing source-supported search, sort, genre and platform filters continue through the backend. Steam details include only supplied HTTPS screenshots and MP4 trailers, with lazy images and no video autoplay. Other providers omit unavailable media. Genre links offer related exploration without inventing a similarity score.

Run npm run build, npm test --workspace backend, and npm test --workspace frontend. There is no configured lint command. Run npm run test:ui --workspace frontend for the isolated Edge browser smoke suite (Windows default Edge path, or configure EDGE_PATH). It uses deterministic HTTP fixtures and a temporary browser profile, never real accounts. It checks collection persistence and journal statistics, favorite/removal flows, search empty/error/retry states, mobile navigation, sign-in Escape/focus behavior, and seven public routes at 1440, 1024, 768, 390 and 320 pixels. Backend tests validate source mappings independently; this browser suite does not verify live provider uptime or database account synchronization.


## Account library database migration

Migration 20261102090000_account_library adds LibraryEntry with a user relation, a unique user/slug key, validated game JSON, playing status, favorite, rating, hours, notes and timestamps. It does not modify existing games, users, wishlists or alerts. The snapshot lets games from any supported live storefront be saved without first populating the canonical Game table. All reads, updates and deletes are scoped to the verified token's user ID; client-supplied ownership is rejected. PUT adds without overwriting an existing journal; PATCH updates validated journal fields; POST /api/library/import preserves existing account entries.

For another environment, run npm run db:generate --workspace backend, then run npx prisma migrate deploy from backend before starting the updated server. The migration has been applied to this workspace's configured local database. Stop/reload the backend before Prisma generation on Windows if its engine DLL is locked.

Run the optional real MySQL smoke test from backend with GAMEVAULT_DATABASE_TESTS=1 and node --import tsx --test tests/libraryDatabase.test.ts. It creates isolated temporary accounts, checks persistence and ownership boundaries, and removes those accounts afterward. Normal backend tests do not require a database. The browser fixture suite also checks sign-in, explicit import, journal save, refresh and sign-out back to the original device data; it does not contact a real Steam account.


## GOG recovery and regional storefront game prices

GOG's optional catalogue artwork may be null (including galaxyBackgroundImage). These fields are nullable so one game's missing background cannot reject an entire page. The regression fixture includes this live-observed case; live pages 1 and 2 returned 24 games each after the fix.

Xbox Console and Xbox PC hydrate SKU availability in a batched ZA product request, matched by product ID while retaining search order. Prices use public full-game Purchase offers in ZAR for the requested device platform. Trials, subscriptions, redemption/license-only offers, remediation/member-only offers, other currencies, and inactive date ranges are excluded. Nintendo catalogue NSUIDs are matched to the official country=ZA price endpoint; UK metadata prices are ignored. Active ZA discounts are shown against their regular ZA price. Legacy, unavailable and unmatched products retain unknown prices. Nintendo and Xbox price sorting operates on each loaded page, not a global storefront price order. Optional price lookup failures leave metadata usable.

Epic now attempts a paginated ZA base-game/bundle catalogue query rather than treating the promotional feed as complete. Full-catalogue results preserve namespace and offer ID for direct detail lookup. If the catalogue request is blocked, rate-limited, or invalid, a five-minute per-query cooldown prevents repeated failed requests and the UI explicitly labels the limited promotions fallback. At verification time Epic returned HTTP 403 security challenges, so the live full catalogue could not be verified or delivered from this server; only pagination fixtures passed. Existing promotion-only game IDs are preserved for saved collections. No access challenge bypass or invented catalogue entries are used.

Verification for this change includes backend regressions, production compilation and direct live reads of GOG pages, Xbox Console/PC purchase quotes, Nintendo ZA regular/discount prices, and Epic's fallback coverage.


## Paginated multi-store deals

GET /api/deals accepts source (all by default, or steam/gog/xbox/xboxpc/nintendo/epic), an optional positive budget, limit (1-50 per source, default 24), and an optional JSON cursor. Use the returned meta.nextCursor on subsequent requests; zero marks an exhausted source. Successful sources advance independently while failed sources retain their page for retry. Partial failures return the other stores' results and explicit per-source errors. Deals are deduplicated by source/platform listing slug and require finite ZAR prices with originalPrice greater than price. Upcoming games and missing prices are excluded. There is no fabricated global deal count.

Steam now pages its specials search instead of the small featured feed. GOG uses its discounted catalogue filter. Xbox Console and PC check catalogue pages for public purchase discounts. Nintendo uses UK digital-sale candidates for discovery, but validates every displayed discount against ZA eShop pricing; this is not an exhaustive list of ZA-only sales. Epic uses its catalogue when accessible and clearly labels the limited promotions fallback otherwise. Source availability and coverage remain visible in the Deals page.

The page defaults to all supported stores, appends further results through Load more deals, and offers storefront, custom budget, and loaded-result discount/price ordering controls. Budget and storefront changes reset pagination, failed pages can be retried, and one unavailable source does not remove the other stores' deals. Browser tests cover deal pagination, storefront switching and a decimal custom budget in addition to representative screen widths.


## Platform evolution

The app now includes private collections, advanced backlog metadata, dated journals/reviews, personalized recommendations, comparison, upcoming releases/watchlists, a filtered library picker, profile preferences and annual Gaming Wrapped with an opt-in local PNG. Use the Play & track menu to reach the new pages. Account workspace data is stored in MySQL with version checks; guest data remains separate and can be explicitly imported.

See [implementation plan](docs/GAMEVAULT_IMPLEMENTATION_PLAN.md), [progress by phase](docs/GAMEVAULT_PROGRESS.md), [architecture and setup](docs/GAMEVAULT_ARCHITECTURE.md), and [executed test report](docs/GAMEVAULT_TEST_REPORT.md). Migration 20261102120000_platform_workspace is applied locally. Run npm ci and regenerate Prisma when setting up another checkout; then run prisma migrate deploy from backend. Dependency security fixes are recorded in the lockfile and audit report.


## Indexed account journals

Account journals now use an indexed JournalRecord table with paginated reads and independent edit revisions. Existing JSON entries migrate transactionally on the next account load. This removes the old workspace-wide history limit for authenticated users, preserves device-only journals/import, and calculates annual summaries without sending private notes to the browser. The new migration is applied locally; refresh the app to load the new client. See [journal storage and rollout](docs/GAMEVAULT_JOURNAL_STORAGE.md).
