# GameVault 2.0 progress

## Phase 0 - architecture and baseline
Completed. Inspected file inventory, schema, auth, endpoints, storage/repository boundaries, storefronts, UI tokens/navigation, test harnesses and existing architecture records. No AGENTS.md was found. Working tree was clean before this implementation. Baseline: backend 46 passed / 3 opt-in database tests skipped; frontend 15 passed. Existing data and migrations retained.

## Phase 1 - profiles
Implemented opt-in SocialProfile, normalized unique usernames, profile URLs, HTTPS avatar/banner references, biography, library sharing, favorites, full-library counts, recently updated completed titles and achievement showcase. Profile tabs expose library/reviews/collections/activity. Default private; minimal name/handle/avatar card remains discoverable so follow requests can be initiated. Public DTOs omit email, credentials, private notes, hours, journal and workspace data. Revisioned edits require the authenticated owner.

## Phase 2 - relationships
Implemented follows/unfollows, private requests and owner approval/decline, relationship lists, paginated people search/discovery and blocking. Duplicate relationships use composite constraints. Blocks remove both follow directions, cross-user likes/collection follows and actor notifications; current queries exclude blocks in both directions. Discovery suggestions are real other accounts in handle order, not claimed personalized recommendations.

## Phase 3 - feed
Implemented cursor-paginated public and following feeds and profile-specific activity. Library actions and explicit review/collection publication generate deduplicated records; library mutations and their social records commit together. Achievements generate activity. Feed queries batch related rows and check current profile/library/collection/review visibility. Deleted/hidden/unshared entities are omitted, even if an older activity exists. Private authors appear only to authorized profile viewers or approved followers in the following feed. No private journal text is published.

## Phase 4 - reviews
Implemented separate community publications, one per account/storefront game, revisioned edits/deletes, spoiler disclosure, search/newest/rating sorting, deduplicated likes and reports. Admin-only moderation reads the current database role and can hide a review or dismiss reports. Hidden reviews cannot be republished by editing. All text uses Vue interpolation; no user HTML rendering. Validation and bounded write rate limits apply.

## Phase 5 - Steam
Implemented authenticated one-use link tickets tied to verified Valve OpenID callbacks, unique identity linking, official Web API owned-game import, private playtime snapshots, per-game achievement import, sync status/manual retry and disconnect. Existing manually entered library fields are never overwritten; Steam observations are separate snapshots. Sync claims a database lease and processes bounded batches. Private/incomplete responses fail explicitly. Credentials stay on the server. No real Steam password, API key, or live account authorization was available for end-to-end live import; official-contract fixtures and real temporary MySQL records verify behavior. Live imports require STEAM_WEB_API_KEY. Existing Steam sign-in remains functional.

## Phase 6 - collections
Implemented independent publications copied explicitly from private collections/library selections, public/private visibility, descriptions/theme, HTTPS custom cover, shareable URLs, discovery, revisioned owner edits/deletes and collection following. UUID create retries preserve the initial publication. Private workspace collections remain unchanged. Public means visible to authorized profile viewers; private collection means owner only. Optional collaborator invitations are not implemented: publishing snapshots keeps existing private workspace permissions intact.

## Phase 7 - customization
Implemented server-persisted accent/density/motion/homepage recommendation/dashboard-statistics/notification choices, studio, banners and existing library favorites as showcase selection. Settings apply through shared design tokens and reset when signing out. OS reduced-motion rules remain supported. Arbitrary widget dragging, image uploads and arbitrary CSS are not implemented.

## Phase 8 - achievements
Implemented eight original definitions, database-derived progress, unique unlock timestamps, profile/studio showcase and in-app unlock notifications. Library/review/collection actions evaluate relevant saved data; opening achievements also evaluates existing records and private journal count. Imported histories are evaluated without generating one activity for every imported game. Historical unlock dates reflect the first evaluation, not invented past dates. Rarity is deliberately absent because no meaningful platform population statistics were established.

## Phase 9 - notifications
Implemented indexed owner-scoped notification center, unread count, minute polling while visible, individual/all read actions, cursor pagination and opt-out for new notifications. Types currently generated: followers, follow requests, review likes and achievement unlocks. Collection invitations have no notification because optional collaboration is absent. No email, push or WebSocket delivery is claimed.

## Phase 10 - verification
Production build/type checks pass in the implementation runs. Expanded browser harness passes profile editing, spoiler review publication, stored-text escaping, likes, collections, inbox and social layouts at 1440/768/390/320px, alongside the prior journal/library/deals/responsive regressions. Backend tests include actual MySQL ownership, privacy revocation, pagination and Steam fixtures. Frontend tests cover account-bound response isolation and superseded filters. npm audit reports zero known vulnerabilities; no dependency was added. Final check results are recorded in GAMEVAULT_2_0_REPORT.md. No production deployment, destructive migration, live email or paid service was performed.

## Final verification results

- Backend with GAMEVAULT_DATABASE_TESTS=1: 63 passed, 0 failed, 0 skipped.
- Frontend: 17 passed, 0 failed. Total: 80 passing named tests including nested social checks.
- Expanded Edge browser regression harness: passed; social routes checked at 1440, 768, 390 and 320 pixels, alongside existing application checks.
- Production build (backend tsc, frontend vue-tsc and Vite): passed.
- Prettier check for new/changed social source and tests: passed. git diff --check: passed (only existing Windows newline normalization notices).
- Prisma validate: passed. migrate status: all seven migrations applied, database up to date. The two social migrations are additive.
- npm audit: 0 known vulnerabilities. Dependencies added: none.
- Running local API: health 200, public social user listing 200, unauthenticated social/me 401, unauthenticated steam-library 401. No live account content printed.
- Live Steam import remains unverified without an authorized Steam account/key; explicit fixture-based behavior and MySQL persistence passed. No production deployment, email/push delivery or destructive migration performed.

## Completion follow-up - 3 November 2026

Implemented collection invitations/roles, safe artwork uploads, dashboard/home ordering, featured collections, public-library player suggestions, real rarity, username aliases, management pagination and saved Steam achievement retrieval. The prior deferred-local-feature list is superseded. See [completion report](GAMEVAULT_2_0_COMPLETION.md). External Steam credentials and delivery providers remain unconfigured; no external delivery/deployment is claimed.

## Final follow-up results

- Backend with all MySQL fixtures enabled: 69 passed, zero failures/skips. Frontend: 17 passed. Total: 86 passing tests.
- Full browser regression suite passed, including persistent dashboard widget order/visibility and homepage section choices/ranking after navigation, plus prior account/social/journal/deals/mobile checks. Browser fixtures simulate separate user interactions and wait for account preferences to load.
- Production build and type checks passed; final backend output rebuilt after invitation-notification renewal handling. Formatting and whitespace checks passed.
- Prisma schema validated; all eight local migrations applied with no pending migration. No destructive migration or production deployment performed.
- npm audit after adding Sharp: zero known vulnerabilities. New direct dependency: sharp ^0.35.5.
- External blockers: live Steam acceptance requires an authorized account/key; actual email/push delivery remains unconfigured. These do not affect local in-app invitations, notifications or the completed social features.
