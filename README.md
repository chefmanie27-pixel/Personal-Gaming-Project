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
