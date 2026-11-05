# GameVault - Project and Improvement Brief

Updated: 5 November 2026.
Purpose: Give an AI assistant, designer or developer enough accurate context to propose improvements and fixes for the existing project.

## 1. Project overview

GameVault is a full-stack game discovery, personal library, backlog, gaming journal and community web application. It helps people find PC and console games, compare regional deals, investigate a game, track their gaming activity and explicitly share selected content with other players.

The pricing focus is South Africa: ZA availability and ZAR amounts. Storefront coverage varies; this is not a complete global catalogue. The application has implemented frontend/backend functionality, MySQL persistence and regression tests. It is an existing product to improve incrementally, rather than a concept to rebuild.

## 2. Current status

Implemented features include discovery, multiple storefront adapters, account/device libraries, journals, recommendations, goals, analytics, social profiles, collaborative collections, reviews, customization, Steam integration and price alerts.

Two additional features are implemented and tested but default off:
- Discussions: DISCUSSIONS_ENABLED=0 by default. Includes threads, replies, editing, reports and moderation history.
- Durable price-alert scheduling/history: DURABLE_ALERTS_ENABLED=0 by default. Includes persisted worker leases, progress/retries and private delivery records.

Neither flag is explicitly set in the inspected local backend/.env. Runtime environment overrides were not inspected. The associated additive migrations were tested only on disposable databases during the improvement program; activation against existing data requires a reviewed migration/backup and authorization. Do not assume every feature described below is currently visible on the running site.

External limitations include optional RAWG credentials, Steam owned-library credentials/authorized visibility, Epic catalogue restrictions, unavailable PlayStation live catalogue data and unconfigured email/push delivery.

## 3. User-facing pages

| Page/route | Main purpose |
| --- | --- |
| Home / | Featured games, discovery sections, contextual welcome/onboarding and recommendations |
| Catalogue /catalogue | Storefront browsing, search, pagination and filters |
| Game /games/:slug | Metadata, media, store links, requirements, editions/DLC, library controls, prices, reviews and staged discussions |
| Deals /deals | Paginated discounts across supported stores and preset/custom budgets |
| Subscriptions /subscriptions | PC/console subscription plans with source/billing-period labels |
| Library /library | Search, filters, sorting, grid/list views and bulk status changes |
| Backlog /backlog; Favorites /favorites | Focused views of the personal library |
| Collections /collections | Private personal collections |
| Journal /journal | Private dated sessions and personal review entries |
| Dashboard /dashboard | Personal statistics and configurable widgets |
| Goals /goals | Dated goals, opt-in monthly challenges, activity calendar and private timeline |
| Wrapped /wrapped | Annual summary and optional local PNG export |
| Compare /compare | Side-by-side game comparison |
| Upcoming /upcoming | Release browsing and private watchlists |
| Play Next /play-next | Filtered random selection from the user's library |
| Preferences /preferences | Private profile/discovery preferences and recommendation feedback reset |
| Community /community | Public/following feeds, reviews, discussions, people, collections, inbox and admin moderation tabs |
| Studio /social/studio | Social profile/privacy, customization, uploads, invitations, blocks, achievements and Steam connection |
| Profile /u/:username | Visible library, reviews, collections and activity |
| Shared collection /community/collections/:id | Owner/editor/viewer collaboration; /new creates a publication |
| Account /account | Price-alert management, rules and staged private delivery history |
| Admin /admin | Administrator counts, synchronization logs and administrative actions |

Navigation groups Discover, My Games, Community and Account. Mobile quick links, search history, a search keyboard shortcut, selected navigation states, Escape/focus handling and inbox/account controls are implemented.

## 4. Discovery and storefront coverage

Discovery includes paginated catalogue results, scrollable sections, search, available provider filters/sorts, selected storefront controls, storefront badges, cover fallbacks and higher-resolution images where supplied. Catalogue budget/release filters clearly distinguish visible results from loaded/provider results; some filters operate on loaded candidates only.

The discovery Feeling Lucky button selects a game from available candidates matching chosen constraints such as available score and price. Play Next is a separate picker for the user's saved library, with priority/status filtering and avoidance of immediate repetition when alternatives exist.

Recommendations use explainable deterministic rules based on genres/platforms, favorites, ratings, playing/completion status and private interested/not-interested/less-like feedback. Ranking adds bounded diversity and session novelty. Feedback can be reset. This is not an external AI model or a search over every game ever released.

| Source | Coverage and limits |
| --- | --- |
| Steam | Store catalogue/search/details, ZA pricing, supplied critic scores and verified Steam sign-in |
| GOG | PC catalogue/details, regional quotes, supplied requirements and related products; no supplied Metacritic scores in this adapter |
| Xbox Console | Microsoft console listings and qualifying public ZA full-game purchase prices |
| Xbox PC | Separate Windows PC listings, qualifying ZA prices and supplied requirements |
| Nintendo | UK discovery metadata matched by exact product IDs to supported South African digital prices; incomplete legacy-title pricing |
| Epic Games Store | Paginated catalogue when access is permitted; explicit limited promotions fallback when blocked |
| PlayStation | Official storefront links; live catalogue access unavailable in the current integration |
| RAWG | Optional PC/console metadata and critic scores; API key required; no purchase prices supplied here |

Foreign-currency, member-only, subscription-only, trial, incompatible or expired offers must not become standard ZA purchase quotes. Unknown scores/prices remain unavailable. Cross-store ownership and product identity are not guessed through fuzzy title matching.

## 5. Game details, deals and subscriptions

Depending on provider data, game pages show covers/hero images, descriptions, genres/platforms, developer/publisher, release information, supplied critic scores, screenshots and trailers. Trailers do not autoplay. Store destinations include applicable Steam web/app links.

PC requirements separate minimum/recommended tiers and operating systems when supplied. Editions, bundles and DLC use actual provider relationships and external store destinations. Missing media/requirements/add-ons have independent unavailable/error states.

Deals combine supported Steam, GOG, Xbox Console/PC, Nintendo and Epic sources. Preset/custom decimal budgets, independent source pagination and isolated provider failures are implemented. Discounts require qualifying real current/original amounts. Coverage is partial where the provider is restricted; Nintendo discovery is not guaranteed to find every ZA-only sale.

Subscription comparisons distinguish platforms, billing periods and live versus dated reference versus unavailable prices. Reference prices are not fresh checkout quotes.

## 6. Library, journals, goals and analytics

Users can add/remove games, mark favorites, assign Want to Play / Currently Playing / Completed / On Hold / Dropped, record personal 0-10 ratings/hours/private notes, set priority and completion/target dates, and organize private collections. Search, sorting, grid/list views, selected-game comparison and atomic bulk status updates are implemented. Bulk changes preserve unrelated personal fields.

Private journals store dated play sessions and personal reviews with minutes, notes, progress, tags, ratings and spoiler flags. Account journals use indexed records, pagination/search and revision checks. Private journal reviews are distinct from explicitly published community reviews.

Dashboard widgets show actual totals, status/genre/rating breakdowns. Goals track explicitly recorded completions, sessions or minutes over a chosen period. The Goals page includes monthly summaries, a daily activity calendar and a private timeline. Monthly challenge presets require opt-in and remain private; they are based on self-recorded activity, without a competitive leaderboard or anti-cheat claims.

Wrapped uses real dated sessions/completions rather than allocating lifetime playtime to invented dates. Its PNG export is generated locally with disclosure choices. Richer Wrapped storytelling, year-over-year analytics and a complete historical backlog ledger remain roadmap work.

Upcoming releases/watchlists distinguish exact dates, vague quarters and unknown announcements. Release refreshing is explicit; background release-notification delivery is not claimed.

## 7. Guest/account data and privacy

Guests keep separate device-only library/workspace data in browser storage. Signed-in users load their own MySQL records. Signing in does not silently import or publish guest data. Explicit import keeps the device backup and prefers existing account records on conflicts. Signing out restores the guest context. Late responses, stale revisions and account changes are guarded.

Private notes, journals, goals, recommendation feedback, rules and Steam snapshots are not automatically published. Public profiles/reviews/collections are explicit publications governed by server-side ownership, privacy, follow approvals, blocks and accepted collaboration roles.

## 8. Community and collaboration

Social profiles have normalized unique usernames, old-username aliases, display name, bio, avatar/banner, private-by-default visibility and explicit library sharing. Minimal identity cards allow account discovery. Follow requests need approval for private accounts; unfollowing/blocking revokes applicable access. Suggested players use explicitly public shared-library overlap.

Public/following/profile feeds are chronological and paginated. They reflect saved additions/completions/favorites, publications and achievement unlocks, with current privacy/block checks.

Community reviews support title/body/rating, spoiler hiding, search/sort, likes, report categories, versioned owner editing/deletion and basic administrator hide/dismiss moderation. This is not a complete bans/appeals program.

Shared collections have names, descriptions, themes, covers, ordered games and shareable URLs. Publishing is separate from private collections. Viewer/editor invitations require acceptance. Editors can edit content with version checks but cannot change visibility, delete collections or manage membership. Owners can revoke; members can decline/leave; blocking revokes membership. Following and admin-curated featuring are implemented. Existing limits include 100 games and 25 collaborators per shared collection.

Staged discussions support game-specific threads/replies, spoiler controls, direct thread links, versioned editing, soft deletion, replay-safe creation, categorized reports and audited admin decisions. Reply conflicts retain drafts; unavailable-thread refresh clears replies. Privacy/follow/block checks apply to lists and direct access. Full moderation policies/appeals and broader accessibility acceptance remain open.

## 9. Customization, artwork, achievements and Steam

Users can select accents, compact/comfortable density and reduced motion; reorder/show/hide homepage sections and dashboard widgets; and control recommendations/notifications. Private preferences and the social studio remain separate areas that could benefit from clearer organization.

Artwork supports remote HTTPS URLs and owner-managed PNG/JPEG/WebP uploads processed by Sharp: validated, resized, metadata-stripped and re-encoded as WebP. Existing upload limits include 2 MiB input, 16 million pixels and 20 saved images per account. Uploaded artwork is public by URL, even for private profiles; it is not private screenshot storage. Deletion breaks saved references.

GameVault participation achievements include First Game Added, First Review Published, Ten Games Completed, Fifty Games Collected, Backlog Explorer, Genre Specialist, Collection Curator and Gaming Historian. Unlocks are unique/timestamped, and rarity uses actual visible public-profile counts. These awards are distinct from Steam achievements and rely partly on self-maintained metadata.

Steam sign-in/linking verifies Valve OpenID; GameVault does not collect Steam passwords. Short-lived one-use tickets/exchange codes support linking/login. Existing identities are not silently merged. Owned-game imports match exact app IDs, preserve manual library fields and keep separate private snapshots. Manual sync/retry/disconnect and saved imported achievements are supported. Private/incomplete Steam responses do not erase the collection. Live owned-library/achievement calls require a server Steam key and authorized visibility; fixture tests do not establish live acceptance.

## 10. Price alerts, delivery and history

Exact provider reconciliation stores genuine ZA/ZAR observations with provider timestamps and cached-read deduplication. Price history shows observed latest/low/change, coverage, dates, an accessible table and a lazily loaded chart, with honest empty/error/retry states. No chart history is fabricated.

Alert rules support target price, preceding-price percentage drop, recorded historical low and cooldown. Repeated/concurrent saves reuse the same account/listing/target/currency alert. Paused alerts stay paused, rules/trigger state survive retries, and target edits reject duplicates. Legacy duplicate rows are retained rather than silently deleted.

In-app notifications support unread/read actions and preferences, covering social events and price matches. Email/push transports remain disabled.

Staged durable mode provides a database-clock lease, persisted cursor/due time/retry state, bounded batches, expired-worker fencing and atomic notification/trigger/history writes. Private account history shows observed/recorded dates and delivered/disabled/duplicate outcomes; pagination is account-scoped. Alert deletion retains history; account deletion cascades it. Earlier notifications are not backfilled. This is an in-app price-alert worker, not a generic external-message queue. Operational activation and real deployment recovery/load acceptance remain outstanding.

## 11. Technical architecture

- Frontend: Vue 3 Composition API, TypeScript, Vite, Vue Router, Pinia and Axios; Chart.js and local browser PNG export.
- Styling: custom responsive CSS/design tokens, dark palette, shared loading/empty/error patterns, focus/reduced-motion support. Tailwind is installed, but do not assume it drives the active UI.
- Backend: Node.js, Express 5, TypeScript and Zod; Sharp for artwork.
- Persistence: MySQL with Prisma 6, migrations, transactional writes, ownership filtering and optimistic revisions.
- Authentication: bcrypt password hashes, seven-day signed bearer JWTs stored by the browser, verified Steam OpenID; admin actions check the current database role.
- Data groups: canonical games/external IDs/stores/listings/quotes; users/wishlists/alerts; library/workspace/journals; social profiles/relationships/reviews/collections/notifications/achievements; Steam snapshots/uploads; staged discussion/moderation and durable-job/delivery tables.
- Diagnostics: generated request IDs, sanitized HTTP/error logs, liveness/readiness endpoints, bounded job execution and graceful HTTP/job/Prisma shutdown.
- Repository: npm workspaces in frontend/ and backend/, schema/migrations under backend/prisma/, implementation documentation under docs/.

## 12. Verification and known gaps

Latest recorded development verification, not rerun to prepare this brief:
- 91 backend unit/API/MySQL tests passed with ten migrations in a newly created disposable database.
- 22 frontend tests passed; a final focused durable-worker suite passed 8 tests.
- Responsive Edge fixture regressions, type checks, production builds and Prisma validation passed.
- Earlier dependency audit reported zero known npm vulnerabilities at that check; this is not a fresh audit or security certification.

Known limits/opportunities:
- Provider completeness, freshness and missing data require clear labels; some filters/recommendations use bounded candidate pools.
- RAWG/Steam credentials, Epic restrictions and PlayStation unavailability remain external dependencies.
- Discussions/durable history require deliberate activation; do not report them as missing implementations or universally live features.
- Richer annual/year-over-year analytics, historical backlog tracking and additional bulk workflows remain unfinished.
- Full accessibility/screen-reader review, representative performance/load measurements and production recovery testing remain open.
- Browser bearer-token storage is the existing auth design. OpenID exchange/link state and rate limits remain process-local; multi-replica operation needs a reviewed shared-state/affinity approach.
- Hosting needs environment-specific HTTPS/proxy/CSP, monitoring, backup restoration and staged migration acceptance.
- Moderation needs policy/appeals and operational maturity. User research, production traffic, monetization and performance guarantees are not established by the code.

## 13. Request to paste into another AI chat

Read this brief and help me write a detailed implementation prompt for improving and fixing my existing GameVault project. Preserve its working Vue/Express/Prisma architecture and existing features rather than proposing a full rebuild.

Identify high-value improvements across UI consistency, navigation/onboarding, discovery/filter relevance, storefront reliability, library/backlog/journal workflows, analytics, community, accessibility, performance and security. Separate confirmed limitations from hypotheses that require source inspection or user testing. Do not present already implemented features as missing; distinguish default-off implementations from active functionality.

Prioritize work by user impact, effort, risk and dependencies. Produce a phased coding-agent prompt with affected pages/components/APIs, concrete user journeys, acceptance criteria and meaningful tests. Start with a repository audit and actual bug evidence. Preserve private data, guest/account separation, revision checks and collection permissions. Never fabricate prices, critic scores, activity, history or successful integrations.

Require incremental reviewable changes, migration safety and updated documentation. Use disposable databases for migration/integration tests. Do not authorize production deployment, destructive migrations, publication of private data, paid services or real external messages. Identify credentials/configuration needs without asking for secrets in chat. Report completed/partial/blocked work accurately and distinguish fixture-tested behavior from live provider/production acceptance.

## 14. Useful source records

- frontend/src/router.ts - actual pages/routes.
- backend/src/integrations/sources.ts - storefront capabilities and coverage.
- backend/prisma/schema.prisma - actual data model.
- docs/GAMEVAULT_IMPLEMENTATION_REPORT.md - implemented improvements and status.
- docs/GAMEVAULT_IMPROVEMENT_ROADMAP.md - unfinished work and next priorities.
- docs/GAMEVAULT_TEST_RESULTS.md - historical verification evidence.
- docs/GAMEVAULT_DEPLOYMENT_READINESS.md - staged activation/hosting/recovery requirements.

Inspect source when older planning documents disagree with current implementation. This brief describes the repository and recorded checks as reviewed on 5 November 2026; it does not certify a live deployment.
