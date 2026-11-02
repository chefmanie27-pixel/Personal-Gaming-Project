# GameVault architecture

## Existing foundation

Vue 3 + TypeScript + Pinia + Vue Router + Vite client; Express 5 + TypeScript server; Prisma 6 + MySQL persistence. Axios handles browser API requests. Existing Chart.js price history, storefront caching and single-flight requests, regional pricing rules, Steam OpenID, password authentication, account libraries, alerts, requirements and DLC features remain available. No deployment manifest/container pipeline was present in the inspected repository.

## Routes and components

New lazy routes: /backlog, /collections, /journal, /compare, /upcoming, /play-next, /wrapped and /preferences. Existing Home, Catalogue, Details, Deals, Subscriptions, Library, Favorites, Dashboard, Account and Admin routes remain. Navigation groups secondary features under Play & track. GameCard is reused for discovery, recommendations, picks, library and upcoming views. AdvancedLibraryControls augments the existing journal controls. Unknown application paths render a helpful fallback.

## Storage

LibraryEntry remains authoritative for game status, favorites, lifetime personal ratings and recorded total hours. UserWorkspace adds a unique user-owned JSON document with an integer version and updated timestamp. Validated sections hold profile/preferences, named collections, completion/priority/membership metadata by storefront slug, dated private journal/review records, and watchlist snapshots. Snapshots preserve historical journal context when a game leaves the library; current store information is fetched from Details, not inferred from a historical snapshot.

GET /api/workspace requires a verified token, returns only that user's data and version, and disables response caching. PUT requires the expected version and validated data; a user-scoped atomic version match updates the row and increments the version. A stale save returns 409. Client writes are serialized and session revisions discard late responses. Failures retain saved state and show retry/reload feedback. Guest workspace data uses gamevault_workspace_v1 and is separate from account data. Import is explicit, preserves the guest backup, and prefers account records on identifier conflicts. Library import remains a separate action.

Workspace limits: 4 MiB, 100 collections, 2,000 journals/reviews, 1,000 watches and 5,000 per-game metadata entries. Future high-volume deployment should normalize and paginate the event records. No private journal endpoints are public. User text is rendered using interpolation, including spoiler disclosures; no user HTML is injected.

## Logic

Recommendations use preference genres (weight 4) plus genre signals from favorites (3), high personal ratings (2), and other library games (1). Matched affinity, preferred-platform compatibility and available critic scores determine an explainable order. All existing library games and duplicate titles are excluded. This is a rule-based sample, not collaborative filtering or an AI service.

Picker randomness is drawn only from the filtered library pool and avoids the immediately prior slug when another option exists. Annual statistics use explicit completion dates on completed library games and dated sessions/reviews. They never spread lifetime hours across years. Multi-genre session time contributes to each supplied genre and is labeled accordingly. PNG exports are rendered locally with optional hours/title disclosure and are not uploaded.

GET /api/upcoming pages Steam coming-soon results. Release days are parsed explicitly without local-time date shifts. Year-only, quarter, unknown and distant placeholder announcements stay out of exact calendar cells. Watched announcements refresh only by user action, in rotating batches. No background delivery mechanism is claimed.

## Security and deployment

Authentication reuses bcrypt and signed JWTs, including existing Steam callback verification. Sensitive ownership comes from the verified subject, never a client user ID. Login/registration/exchange attempts have a bounded process-local IP limiter. Production startup rejects development credentials and non-HTTPS public origins. Error responses do not expose request bodies or database credentials. API keys stay server-side. JWT storage remains the existing browser-token model; maintain strong script controls in deployment. Distributed rate limiting and HTTPS reverse-proxy configuration are deployment considerations.

Zod ^4.6.7 and vue-tsc ^3.3.14 replace vulnerable versions; the audited lockfile resolves Prisma/client 6.12.0. No new service credentials were introduced. Required environment variables remain DATABASE_URL, JWT_SECRET, FRONTEND_ORIGIN and PUBLIC_API_ORIGIN; PORT and optional RAWG_API_KEY remain supported. VITE_API_URL is the browser-visible API origin, never a secret.

## Setup

1. npm ci
2. Configure backend/.env with existing local credentials; do not commit it.
3. npm run db:generate --workspace backend
4. From backend: npx prisma migrate deploy
5. From repository root: npm run dev

Build: npm run build. Backend runtime: npm start --workspace backend; serve frontend/dist through the chosen HTTPS static host/reverse proxy. No production deployment was performed.

Migration 20261102120000_platform_workspace was applied to the configured local database. It adds only UserWorkspace and its user foreign key. Existing library/store/user data is unchanged. docs/workspace_rollback.sql is an explicit, destructive-to-workspace-only rollback artifact; export the new data and obtain appropriate authorization before using it. It was not executed.


## Journal normalization follow-up

Authenticated journal storage now uses JournalRecord and /api/journal rather than the bounded workspace JSON array. UserWorkspace retains metadata/preferences/collections/watchlists plus a migration marker. GET workspace returns journalMode=normalized and an empty legacy journal array after transactional backfill. Individual record revisions isolate journal editing from unrelated workspace changes. See [journal storage](GAMEVAULT_JOURNAL_STORAGE.md) for rollout and downgrade constraints, pagination, import and summary contracts. Device-only journals still use the old bounded format.
