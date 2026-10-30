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

The Deals page is available at `/deals`, and game details include a Chart.js price-history view. Deals use Steam regional prices. Price history remains empty until genuine observations have been stored. Stored `RegionalPrice` observations automatically take precedence when available.

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
