# GameVault implementation plan

## Audit
Vue 3.5 / TypeScript / Pinia / Vue Router / Vite 6 frontend; Express 5 / TypeScript backend; Prisma 6.19 generated client and MySQL. Chart.js already supports price history. Existing authentication uses bcrypt and signed seven-day JWTs plus Steam OpenID. Store adapters provide Steam, GOG, Xbox Console/PC, Nintendo and Epic, with optional server-only RAWG credentials. No additional paid service is needed.

Existing features: shared dark theme, responsive menu, cover fallbacks and storefront badges, paginated catalogue, custom-budget multi-store deals, subscriptions, DLC/editions, PC requirements, authenticated library CRUD, guest import, journals per game, favorites, statistics and isolated Edge browser tests. Existing uncommitted work is preserved.

## Gaps and decisions
Missing recommendations, custom collections, completion dates/priorities, chronological sessions/reviews, comparison, release watchlist/calendar, library picker, annual summaries and profile preferences. Build on the existing library rather than replace it. Unknown release dates, unavailable prices and missing playtime must stay unknown.

Add a private UserWorkspace row per account containing validated workspace JSON and an integer version. CAS updates prevent silent cross-device overwrites. This additive model stores preferences, collections, dated journals/reviews, release watches, profile information and per-game completion/priority metadata; LibraryEntry remains the authoritative library. Account ownership comes only from JWT middleware. Guest workspace data stays separately in localStorage with explicit import.

## Order
0. Record baseline and documentation.
1. Shared navigation and tokens; preserve current theme.
2. Explainable recommendations and preference editing.
3. Collections, backlog filters, priority/completion metadata.
4. Dated private journal/review CRUD with spoilers.
5. Two-game comparison.
6. Upcoming release sampling, calendar and persistent watchlist.
7. Filtered random library picker without immediate repeats.
8. Annual analytics and opt-in share-card export.
9. Account profile and authentication rate limiting.
10. Production build, unit/API/database/browser checks, audit and final documentation.

## Migration and compatibility
Add UserWorkspace with a unique user foreign key, JSON data, version and timestamps. Preserve existing tables and data. Supply a rollback SQL artifact for explicit use only; do not execute it automatically. Reload the development backend for Prisma generation if Windows locks the engine. No environment secrets are changed.

## Verification
Use existing Node/tsx test infrastructure, add deterministic recommendation/picker/year-boundary tests and authenticated workspace ownership/CAS tests. Use real MySQL with isolated test accounts when available. Extend Edge/CDP fixture flows across representative desktop/mobile sizes. Run build/typechecks, existing tests and dependency audit. No lint command is currently configured. Do not claim WCAG certification, real email reminders, complete Epic catalogue access or reliable estimated playtime.

## Final implementation decisions

All ten implementation phases are implemented as an integrated enhancement, with verification at integration checkpoints. The initial baseline passed: production build, 41 backend tests (one opt-in database test skipped), and six frontend tests. Existing uncommitted changes were preserved. No new application or technology-stack replacement was created.

The private JSON workspace is bounded to 4 MiB, 100 collections, 2,000 journal records and 1,000 watched games. This keeps the implementation small and versionable while preserving the existing normalized LibraryEntry table. For larger deployments, split journal/watch records into indexed tables with pagination. Session duration and lifetime library hours remain separate to prevent double counting. Dates are never inferred from add timestamps.

Security audit remediation justified upgrading Zod to ^4.6.7 and vue-tsc to ^3.3.14. Compatible npm audit fixes resolved Prisma tooling to 6.12.0 in the lockfile and regenerated its client. Existing API and database tests were rerun after the changes. Use npm ci to reproduce the verified dependency tree. No paid dependency or service was added.

Remaining limits: no configured email delivery/reset/reminder workflow; Epic full catalogue access remains externally blocked; upcoming discovery is Steam-based and sampled by provider pages; watch announcements update manually in rotating batches; precise playtime estimates and unsupported game modes remain unavailable.


## Completed follow-up: journal scalability

Added an indexed, user-owned JournalRecord model and safe lazy backfill from JSON. Replaced full-history account reads/writes with cursor pagination and revision-checked CRUD. Added private server-side yearly summaries and preserved explicit guest import. The metadata workspace remains bounded; authenticated journals no longer share its history limit. A real 2,104-entry test verifies the new path. No email provider was configured.
