# GameVault improvement audit - 3 November 2026

## Baseline and scope
The working tree already contains uncommitted social-extension source, migration, dependency and documentation changes. Preserve these. Vue 3/Pinia/Vue Router/Vite/TypeScript and custom CSS; Express 5/Zod/MySQL/Prisma 6; bcrypt/JWT and verified Steam OpenID. Sharp processes artwork. Existing product features match the current improvement brief, including accepted collection roles, uploaded images and stored Steam snapshots. Historical README planning sections are superseded by current code and completion documents. Tailwind is installed but current rendering uses custom CSS; no replacement CSS framework is planned.

Current baseline: backend npm test: 50 passed, 6 skipped (database-gated parents); frontend: 17 passed; root typecheck passed. The earlier 69-backend result includes MySQL subtests and is historical. Database tests are not enabled against the configured database because it has not been established as disposable. No schema change or database migration is currently needed for the first phases. Browser/build baseline and later results will be recorded in GAMEVAULT_TEST_RESULTS.md.

## Confirmed findings
- AppHeader has four primary links and a flat 15-item secondary menu, mixing social, discovery and private tools. Existing routes must remain.
- RecommendationsPanel samples one source page and has no private interested/dismiss/less-like feedback. recommend uses preferences/favorites/ratings but does not explicitly weight current playing/completion status or diversify the selected set.
- Catalogue already debounces search and labels advanced loaded-result filters; improve these rather than add a second search implementation.
- LibraryPage bulk status loops over separate account PATCH requests. An intermediate failure can leave a partial batch. Existing ownership is scoped correctly, but atomic bulk behavior is missing.
- Play Next already supports platform/genre/collection/backlog scopes but lacks priority and specific status filters; reliable completion estimates are unavailable.
- Private journals are normalized and paginated; workspace stores versioned private metadata. Reuse these for goals/feedback rather than publish private social events.
- PriceHistoryChart performs an awaited request without a catch, labels empty history Development data and has no useful low/current/coverage summary. This is misleading when no observations exist.
- evaluatePriceAlerts reads every active alert and updates lastTriggered every scheduler cycle while below target; it has no observation-level delivery deduplication and selects the latest price before filtering region/source.
- Scheduler has no stop function or overlapping-run guard; logs raw error objects.
- Existing canonical Game/StoreListing and live snapshots are separate, explaining unavailable alerts for unsynchronized listings.
- Social collection permissions, explicit publication and mutual blocking already exist. Do not duplicate the social platform or broaden existing access.
- Global error handling hides internal errors but has no request correlation ID. Process shutdown does not close the server/scheduler/Prisma pool explicitly.

## Risks, opportunities and unknowns
Guest/account separation and explicit import must be retained. Browser bearer-token storage and process-local OpenID/rate-limit state are existing architectural limits; this program will not silently replace authentication. External provider credentials, Epic access, PlayStation availability, email/push and production hosting remain genuine dependencies. No production performance baseline or full accessibility certification exists. Query and bundle observations should be measured before claiming speed improvements. Existing upload privacy (public by URL), review publication and collaboration quotas must remain explicit.

## Order
1. Shared design tokens/navigation/home/card usability and accessible reusable states; run frontend/build/browser checks.
2. Private recommendation feedback, transparent status-aware diverse ranking and filter scope improvements; tests for ranking/persistence/privacy.
3. Transactional bulk status, private goals/target dates and dated activity/analytics using existing storage. Do not invent estimated hours or historical completions.
4. Genuine price observations/freshness/history and observation-aware in-app alerts; delivery interfaces stay disabled for unconfigured external channels.
5. Improve review/community discovery and collaborator workflows, then assess discussions/challenges as distinct additive capabilities. New schema will only be applied to explicitly disposable data; otherwise supply un-applied migrations and mark activation blocked.
6. Request IDs/structured sanitized logs, bounded job processing, graceful shutdown and deployment/restore documentation. Preserve login compatibility.

This is an implementation audit, not a production security certification. New confirmed findings and phase results will be appended as work progresses.

## Disposable database verification intent
A new helper creates a fresh, uniquely named gamevault_test_improvement_<timestamp>_<random> database on localhost only, never reuses an existing database, and applies all migrations and MySQL fixtures only to that new database. The configured database is used solely as a connection for CREATE DATABASE; it is not migrated, reset or used for test rows. The new database is retained for inspection, with no automatic DROP. If CREATE permission is unavailable, database verification is blocked and other tests continue. No new schema migration is required for workspace feedback/goals or bulk status updates.

## Discussion migration intent
New tables DiscussionThread/DiscussionReply hold explicitly published text (not journals); DiscussionReport deduplicates reports; ModerationAction records decisions without storing credentials. Existing tables gain Prisma relations only. Source deletion is soft deletion; moderators can review explicitly reported publications, never private journals. DISCUSSIONS_ENABLED defaults to 0, so existing databases do not query missing tables. The new migration is to be applied only to newly created disposable databases during this program. Activation against existing data requires a reviewed migration/backup and operator authorization; no reset/downgrade is executed.
