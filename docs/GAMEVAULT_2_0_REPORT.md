> Updated 3 November 2026: see [completion follow-up](GAMEVAULT_2_0_COMPLETION.md) for collaboration, uploads, ordering, featured discovery, suggestions, rarity, aliases and pagination. Omitted-local-feature statements below describe the initial social release.

# GameVault 2.0 implementation report

## What changed
The existing Vue/Express/Prisma application now includes a persistent social layer alongside private libraries, workspaces and journals. See [phase progress](GAMEVAULT_2_0_PROGRESS.md) and [architecture plan](GAMEVAULT_2_0_PLAN.md). Nothing automatically publishes an existing private review or collection.

### Pages
- /community: public/following feeds, people, published collections, inbox and administrator reports.
- /social/studio: profile editing/privacy, account customization, follow requests, blocks, achievements and Steam connection/import controls.
- /u/:username: profile hero and Library, Reviews, Collections and Activity sections.
- /community/collections/new and /community/collections/:id: publish/view/edit/share collections.
- Existing game details now include community reviews. Existing home/dashboard respect saved presentation settings. Navigation and inbox link expose the additions.

### Schema and rollout
Applied locally: 20261103090000_social_platform and 20261103100000_steam_snapshots. Additive tables: SocialProfile, FollowEdge, BlockEdge, CommunityReview, ReviewLike, ReviewReport, PublishedCollection, CollectionFollow, SocialActivity, AchievementUnlock, SocialNotification, SteamConnection, SteamGameSnapshot. User receives corresponding relations. Existing tables/data were not dropped or backfilled into public content. Unique constraints prevent duplicate usernames/follows/likes/reports/unlocks and verified Steam links; composite date/id indexes support feed/notification pagination. Prisma client regenerated. Do not edit an applied migration. No destructive downgrade or production migration/deployment was executed. Back up the database before an external rollout; new records are not representable in older application versions.

### API and authorization
All new social endpoints are under /api/social. /me is authenticated; public profile and list queries accept an optional valid bearer token for viewer-aware visibility. Writes require a verified token; supplied owner identifiers are rejected or ignored in favor of the authenticated subject. Transactions use serializable isolation and retry deadlock/write conflicts. Version matches protect profile/review/collection edits. Collection creation accepts a stable optional UUID so uncertain retries cannot duplicate the publication. Following and likes are idempotent. Profile visibility and mutual blocks are evaluated server-side, including direct collection URLs and feeds. Public endpoints never serialize the User row or private workspace/journal.

Public feeds, collections and notifications use bounded cursor pages (default 20, max 30). User search, relationship lists, rating-sorted reviews and profile library use bounded offset pages; concurrent insertions can shift offset results, while the UI deduplicates where appropriate. Profile library starts with 24 games and supports loading the remainder. Requests and blocks currently return bounded management lists (100/500); moderation returns the oldest 100 open reports, with later reports becoming visible as these are resolved. Names/avatars/handles/private-account status remain discoverable even when the profile's content is private. Blocking governs signed-in social access; a signed-out visitor can still see content an owner deliberately makes public.

User text is rendered with Vue escaping, including spoiler disclosures. HTTPS-only remote artwork URLs have length/protocol/credential checks, lazy loading where appropriate, fixed dimensions and no-referrer image requests. There are no upload endpoints or server-side image fetches. Remote hosts still receive image requests and image availability is outside GameVault's control. JSON payload sizes and Zod limits bound content. API responses disable sniffing and referrer transmission; social responses are no-store to avoid stale private caches. Notifications are generic and owner-scoped. Moderator access checks the current database role, not only the JWT claim.

Auth retains the existing seven-day browser bearer-token design; this project did not migrate sessions to cookies or add password resets/email verification. Rate limits, OpenID state and login exchange tickets remain process-local. Multi-instance deployments need shared rate/state storage or suitable request affinity. HTTPS and a deployment-specific SPA content security policy should be configured by the hosting operator. No new paid or hosted dependency is required.

### Steam behavior and configuration
Set STEAM_WEB_API_KEY only in backend/.env (never in VITE_ variables or source). Linking itself uses the existing verified OpenID flow and does not require a user's Steam password. Authenticated link tickets are one-use, expire quickly and bind the initiating account to callback state/cookie verification. A Steam identity belonging to another existing GameVault account is rejected; there is no silent account merge. After linking, Steam sign-in resolves the linked account. Disconnect removes synchronization snapshots and the connection, retains imported library games, and does not revoke a Steam-only account's underlying sign-in identity; a subsequent explicit verified Steam sign-in reconnects it.

GetOwnedGames uses the official HTTPS Steam API with include_appinfo and available playtime. Game matching is exact by Steam app ID and storefront slug. No fuzzy cross-store entitlement matching is claimed. Imports only create missing LibraryEntry rows; every existing status, note, rating, favorite and hours field remains untouched. New rows receive available Steam hours and Want to Play status; playtime does not imply completion. Repeat imports refresh separate private SteamGameSnapshot observations. Game detail metadata is still loaded by the existing storefront adapter. Invalid/private/missing responses do not erase the account library. A timed database lease prevents normal overlapping syncs; failed partial batches can be retried safely. New import snapshots can remain from committed batches after a later provider failure, and status then reports failed.

Achievement import is explicit per owned synchronized app ID; unsupported/private achievement responses show an error. Only supported fields from GetPlayerAchievements are retained. Steam achievements remain private and distinct from GameVault achievements. No automatic all-game achievement sweep or background schedule is enabled. No live user/API credential was available, so live import is configuration-blocked rather than simulated. Fixtures validate official contracts against temporary database accounts.

Official references reviewed:
- [Steam OpenID and API keys](https://steamcommunity.com/dev)
- [IPlayerService / GetOwnedGames](https://partner.steamgames.com/doc/webapi/IPlayerService)
- [ISteamUserStats / GetPlayerAchievements](https://partner.steamgames.com/doc/webapi/ISteamUserStats)

### Achievements
First Game Added (1 saved game), First Review Published (1 community review), Ten Games Completed (10 completed), Fifty Games Collected (50 saved), Backlog Explorer (5 completed), Genre Specialist (10 games sharing a supplied genre), Collection Curator (1 public collection), Gaming Historian (30 private journal records). Definitions use server-stored records, not client-provided unlock flags. Genre metadata and self-recorded statuses are user-maintained data, so these are participation awards rather than anti-cheat certifications. Unlocks are permanent and deduplicated; removing qualifying content reduces current progress but does not erase the earned timestamp. No fabricated rarity values.

### Testing and limits
Baseline and incremental unit/API/MySQL suites were run; final results below are updated after final verification. MySQL tests create uniquely named temporary accounts and clean up those IDs with cascading fixture deletion. Browser tests use a temporary fixture API and isolated Edge profile; they do not alter real accounts or send messages.

- Backend: official Steam contracts, linking ownership/privacy/failure/import replay/manual preservation, social ownership/unique handles/revisions/private follows/blocks/likes/report moderation/notifications/preferences/pagination, plus prior catalogue/deals/journal/library/workspace tests.
- Frontend: session changes discard old account responses; filter requests discard superseded results; compact public projections exclude private snapshot fields; prior stores/analytics preserved.
- Browser: public profile save, review publish/like/spoiler and stored script text, collection publication and inbox; responsive social routes and existing cross-feature suite.
- Production build invokes backend tsc, frontend vue-tsc --noEmit and Vite. There is no ESLint script in this repository; formatting is checked with Prettier for changed source files. No claim of screen-reader certification or a complete WCAG audit; native labels/buttons/details, visible focus, contrast-conscious accents and motion preferences are implemented and responsive browser layouts checked.
- Dependency audit: zero known vulnerabilities at implementation time. No new packages added; existing lockfile unchanged.

Known scope limits: no optional collaborative collection roles/invitations, image upload/storage, curated editorial featured collections, algorithmic social recommendations, achievement rarity, arbitrary dashboard widget ordering, email or push. Collection discovery is real chronological publications with name/theme search. Moderation is basic report triage/hide, not a full ban/appeal system. Review sorting offers newest and highest rating. Username changes invalidate old URLs; aliases are not retained. Large achievement evaluations still inspect a user's genre snapshots and could benefit from incremental counters at substantial scale. No load-test or production SLO claim is made.

### Files changed
New backend modules: src/social.ts, src/steamLibrary.ts. Updated backend schema, additive migrations, index.ts, config.ts, steamAuth.ts and libraryRepository.ts; optional key documented in .env.example. New tests: social.test.ts, steamLibrary.test.ts; existing Steam login fixture extended. New frontend modules: stores/social.ts, utils/requestScope.ts, components/CommunityReviews.vue, pages/CommunityPage.vue, SocialProfilePage.vue, SocialStudioPage.vue, SharedCollectionPage.vue. Updated App.vue, header/router/styles, HomePage, DashboardPage, GameDetailsPage and browser harness. Added frontend/tests/social.test.ts and these plan/progress/report documents. No generated build output, secrets or temporary baseline schemas are intended for commit.

### Local run
1. npm ci
2. Keep existing backend/.env configuration: DATABASE_URL, JWT_SECRET, FRONTEND_ORIGIN and PUBLIC_API_ORIGIN. Optional STEAM_WEB_API_KEY enables library/achievement imports. VITE_API_URL is a public API URL, never a secret.
3. npm run db:generate --workspace backend
4. From backend: npx prisma migrate deploy
5. From repository root: npm run dev
6. Open the frontend, sign in, then use Play & track > Social profile studio. Create a profile (private by default), choose sharing settings, and visit Community.

Validation commands: npm run build; npm test --workspace backend; npm test --workspace frontend; from backend with GAMEVAULT_DATABASE_TESTS=1, node --import tsx --test tests/*.test.ts; node frontend/scripts/ui-smoke.cjs; npm audit. These PowerShell sessions use npm.cmd/npx.cmd to avoid shell execution-policy issues.

Future improvements: shared auth-state/rate-limit infrastructure for multi-replica hosting, deployment CSP and observability, scalable genre counters/search indexes, reviewer moderation appeal workflows, optional audited collection collaboration, and live Steam acceptance testing with an authorized account/key.

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
