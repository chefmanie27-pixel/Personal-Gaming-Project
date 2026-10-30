# GameVault Development Roadmap

## 1. Phase 1 outcome

The repository started as an empty Git project with only a one-line README. This phase establishes a deliberately small vertical slice instead of attempting every integration at once.

The first production-shaped slice will be:

1. Browse a catalogue of games.
2. Search and filter that catalogue.
3. Open a game details page.
4. See trustworthy metadata and a clearly attributed score summary.
5. See one verified regional storefront price when available.
6. Save a game to a wishlist after authentication.

Deals, multi-store comparison, historical charts, alerts, and administration build on that slice.

## 2. Recommended system architecture

```text
Vue 3 + Vite + TypeScript
        |
        | HTTPS JSON REST API
        v
Express + TypeScript API
  - auth and validation
  - catalogue/read controllers
  - provider adapters
  - cache and rate limits
  - scheduled sync jobs
        |
        +--> Prisma --> MySQL
        +--> RAWG/IGDB metadata
        +--> Steam endpoints
        +--> approved price/review providers
```

The browser must never receive provider secrets. Provider calls belong in the backend, where responses can be normalized, cached, retried with bounded backoff, logged, and stored. API responses should expose a stable GameVault contract rather than provider-specific shapes.

Suggested source structure:

```text
frontend/
  src/{assets,components,composables,layouts,pages,router,services,stores,types}
backend/
  src/{config,controllers,middleware,routes,services,integrations,jobs,utils}
  prisma/
docs/
```

This keeps presentation, domain logic, provider adapters, and persistence separate without introducing microservices prematurely.

## 3. API and data-source feasibility

### Metadata

**RAWG** is the fastest MVP option: its documented API provides a large catalogue, search, platforms, and game discovery, and requires an API key on requests. Confirm licence, attribution, rate limits, image usage, and commercial terms before launch.

**IGDB** is a strong alternative with rich game, platform, company, genre, artwork, and release data. It requires a Twitch account/application and OAuth client credentials, documents a limit of 4 requests per second, and states that its free access is for non-commercial usage under the Twitch Developer Service Agreement. That makes it useful for development, but commercial launch requires a terms review.

### Store and price data

**Steam** provides a public HTTP Web API and public store data. It is the safest first storefront integration, but individual endpoints and redistribution rights still need to be checked before production. Store prices are regional and time-sensitive, so every stored observation needs a region, currency, timestamp, source, and raw/normalized value.

**IsThereAnyDeal (ITAD)** has a documented API with app registration, API keys/OAuth, rate limits, caching expectations, attribution/link requirements, and restrictions against using it to create a competing service. GameVault must contact ITAD or otherwise confirm the intended use is allowed before implementing it as the primary comparison source. Never strip affiliate tags or alter values returned by ITAD.

PlayStation, Xbox, Nintendo, Epic, and GOG should be treated as later adapters. Their public access, regional catalogues, licensing, and price redistribution rules differ; do not assume a stable public API exists.

### Reviews

Begin with structured review records: provider, original score, score scale, normalized score (only when the scale is known), URL, publication date, and attribution. Do not reproduce full copyrighted reviews.

OpenCritic, Metacritic, IGN, and GameSpot access must be verified individually. If no authorized API/feed is available, show links and manually/imported records only, or omit the source. Steam user-review summaries can be considered through permitted Steam endpoints, but they must be labelled as user sentiment rather than professional review scores.

### Engineering safeguards

- Provider adapters with typed response mappers.
- Per-provider request budgets and `429` handling.
- Server-side cache with an explicit freshness window.
- Retries only for transient failures, with bounded exponential backoff.
- Synchronization logs for success, failure, item counts, and provider request IDs where available.
- No fabricated or silently substituted scores/prices.
- `sourceType`: `observed`, `provider_estimate`, or `mock` on price data during development.

## 4. MVP boundary

### Included

- Responsive dark cinematic shell with navigation, search, footer, and accessible loading/error/empty states.
- Home sections backed by the same catalogue API: featured, trending, top rated, recent, and upcoming.
- Catalogue search, genre/platform/year/score filters, sorting, and pagination.
- Game details with artwork, description, release date, companies, platforms, genres, and related games.
- One metadata provider adapter and one verified price provider/storefront.
- Attributed score summaries without copied review prose.
- Registration, login, logout, hashed passwords, JWT access flow, and wishlist CRUD.
- Prisma schema, migrations, validation, structured errors, and focused tests.

### Deferred

- Multi-store comparison and broad regional coverage.
- Price-history claims and charts until enough real observations exist.
- Price alerts, scheduled notifications, admin dashboard, and data-import UI.
- Full professional-review aggregation and scraping.
- Recommendations, social/community reviews, and mobile/native apps.

## 5. Proposed MySQL model

Canonical entities and important constraints:

- `User`: id, email (unique), password hash, role, timestamps.
- `Game`: id, canonical slug (unique), title, description, release date, artwork, metadata provider fields, timestamps.
- `Platform`, `Genre`, `Developer`, `Publisher`: normalized lookup tables with unique names.
- `GamePlatform`, `GameGenre`, `GameDeveloper`, `GamePublisher`: join tables with composite unique keys.
- `ExternalGameId`: provider name + provider game ID (unique together), linked to `Game`; prevents duplicate imports.
- `ReviewSource`: provider name, display name, base URL.
- `Review`: game, source, original score, score scale, normalized score, URL, publication date, attribution, fetched timestamp. Unique by source and external review ID/URL.
- `Store`: canonical store name and website.
- `StoreListing`: game, store, edition/platform, external listing ID, purchase URL. Unique by store and external listing ID.
- `RegionalPrice`: listing, ISO region, currency, amount, original amount, discount percentage, availability, observed timestamp, source type. Avoid mutable “current price” history.
- `PriceHistory`: immutable price observations or a relation to `RegionalPrice`, indexed by listing, region, and observed timestamp.
- `WishlistItem`: user + game composite unique key, optional target price and region.
- `PriceAlert`: wishlist/user + listing or game, target amount, currency, status, last-triggered timestamp.
- `SyncLog`: provider, job type, status, started/finished timestamps, records processed, error summary, correlation ID.

Use foreign keys, indexes for search/filter paths, UTC timestamps, decimal money values (never floating point), and Prisma migrations. Editions and platform-specific listings should not be collapsed into the canonical game.

## 6. Implementation phases

1. **Workspace and feasibility (complete):** establish architecture, source constraints, MVP, schema, and this roadmap.
2. **Foundation (in progress):** scaffold Vite/Vue and Express/TypeScript, shared API types, environment validation, lint/format/test commands, health endpoint, and local development instructions.
3. **Design system (in progress):** app shell, typography, colour tokens, responsive layout, buttons, cards, badges, skeletons, and error states.
4. **Catalogue vertical slice (in progress):** mock data explicitly marked as development data, catalogue endpoints, homepage, search, filters, sorting, and game details.
5. **Real metadata (adapter foundation complete):** a typed RAWG adapter and normalized response mapper are implemented, but credentials, licence review, caching, persistence/upsert orchestration, and production synchronization remain.
6. **Reviews and prices:** add authorized review metadata, one verified storefront price adapter, regional currency handling, freshness labels, and purchase links.
7. **Accounts and wishlists (foundation complete):** Prisma models, bcrypt/JWT authentication, protected wishlist endpoints, price-alert model, and initial frontend auth/wishlist flow. Target-price evaluation and notification delivery remain.
8. **Deals and history (UI/API foundation complete):** add the deals endpoint/page, budget filtering, Chart.js history views, and stored-observation precedence. Provider collection jobs, historical-low rules, and notifications remain.
9. **Operations (foundation complete):** protected admin statistics, sync controls, sync failure logging, an audit table, price-alert evaluation, an alert scheduler, and a RAWG adapter boundary are implemented. Duplicate resolution, rate-limit metrics, notification delivery, accessibility/performance work, and broader provider adapters remain.
10. **Release:** production deployment, secrets/configuration guide, backups, migrations, monitoring, privacy/terms pages, and a final end-to-end test pass.

## 7. What to build first

After approval, Phase 2 should create the frontend/backend foundation and a health-check path. Then build one end-to-end catalogue flow with seeded mock data before adding external credentials. This validates routing, API contracts, database relationships, responsive cards, and error handling early.

The first external integration should be selected only after confirming the intended licence and commercial use. During development, mock data must be visibly labelled and isolated behind the same adapter interface as live data.

## 8. Approval gate

Before Phase 2, confirm:

- The proposed Vue + Express monorepo-style structure is acceptable.
- MySQL is available locally or through a development container/managed instance.
- Which metadata provider is approved for the project: RAWG, IGDB, or another authorized source.
- Whether GameVault is intended for personal/non-commercial use initially or public/commercial launch.
- The default launch region is South Africa (`ZA`) and default currency is ZAR.

## Source links

- [RAWG API documentation](https://rawg.io/apidocs)
- [IGDB API documentation](https://api-docs.igdb.com/)
- [IsThereAnyDeal API documentation and terms](https://docs.isthereanydeal.com/)
- [Steam Web API overview](https://partner.steamgames.com/doc/webapi_overview)
