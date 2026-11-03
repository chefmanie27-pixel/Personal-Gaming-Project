# GameVault: Product, Features and Improvement Brief

Prepared: 3 November 2026
Purpose: Share this document with an AI assistant, designer or developer to obtain an informed improvement proposal and a practical implementation prompt.

## 1. What GameVault is

GameVault is an existing game discovery, personal gaming library and social gaming web application. It helps users browse PC and console storefronts, investigate games, find regional deals, organize their backlog, record their gaming activity and share selected content with other players.

The product began as a discovery and pricing project, then gained persistent account libraries, private journals and analytics, followed by a social platform layer. It is an implemented full-stack application with a real MySQL backend, not just a design concept or static mockup.

Its pricing focus is South Africa: ZAR amounts and ZA storefront availability. It supports PC and console discovery, but coverage varies by storefront and must not be described as a complete global catalogue.

The intended experience combines:
- A visually engaging game discovery site.
- A practical personal library, backlog and gaming journal.
- Regional game and subscription price information.
- A privacy-aware community of players, reviews and curated collections.

This describes the product direction; there is no established market research, monetization plan, production traffic baseline or commercial success claim in this brief.

## 2. Current implementation status

Implemented locally:
- Persistent account libraries, private workspace data and indexed journals.
- Multiple storefront adapters and regional deal browsing.
- Public/private profiles, following, feeds and community reviews.
- Shared collections with accepted viewer/editor collaborators.
- Customization, uploaded artwork, achievements and in-app notifications.
- Database migrations, backend/frontend tests and browser regression checks.

Dependent on external configuration or availability:
- Steam owned-game and achievement synchronization requires a server API key and an authorized Steam account.
- RAWG metadata requires a server API key.
- Epic's full catalogue can be blocked by the provider and then uses an explicitly limited promotions fallback.
- PlayStation live catalogue access is unavailable; users can open the official store.
- Email and push delivery are not configured.

Do not confuse fixture-tested integration code with successful live provider authorization or production deployment.

## 3. Main pages and navigation

| Route | Purpose |
| --- | --- |
| / | Home: featured games, discovery rows and recommendations |
| /catalogue | Storefront browsing, search and filters |
| /games/:slug | Game details, media, store links, requirements, editions/DLC and community reviews |
| /deals | Paginated multi-store regional discounts and custom budgets |
| /subscriptions | PC/console subscription plan comparison |
| /library | Personal game collection, search, filters, sorting and grid/list views |
| /backlog | Backlog-oriented library view |
| /favorites | Favorite games from the personal library |
| /collections | Private personal collections |
| /journal | Private dated sessions and personal reviews |
| /dashboard | Personal statistics and configurable widgets |
| /wrapped | Annual gaming summary and optional local PNG export |
| /compare | Compare selected games |
| /upcoming | Upcoming releases and watched announcements |
| /play-next | Filtered random picker from the user's library |
| /preferences | Existing private profile/discovery preferences |
| /community | Public/following feeds, people, suggestions, collections, featured collections, inbox and admin moderation |
| /social/studio | Social profile/privacy, customization, artwork, invitations, blocks, achievements and Steam connection |
| /u/:username | Gaming profile with Library, Reviews, Collections and Activity sections |
| /community/collections/new | Create a shared collection |
| /community/collections/:id | View/edit/follow a shared collection and manage collaborators |
| /account | Account-related price alerts |
| /admin | Existing administrator counts and synchronization logs |

Navigation includes primary links, a secondary Play & track menu, a search field and account/inbox controls. There is an opportunity to evaluate whether this growing navigation still makes the main tasks easy to find.

## 4. Discovery, storefronts and pricing

### Browsing and discovery
- Browse more games through paginated catalogue results and scrollable discovery rows.
- Search games and select a storefront, with filters/sorts where supported by that provider.
- Some additional filters apply to loaded results rather than the provider's entire catalogue; their scope should remain clear.
- Storefront buttons have selected states; game cards display storefront badges.
- Cover handling uses higher-resolution assets and fallbacks where available.
- An I'm Feeling Lucky discovery control picks from the available games matching its chosen filters, including available score/price constraints. It is not a uniform draw from every game ever released.
- Personal recommendations use genres, favorites, ratings and platform preferences. They are explainable rules, not an external AI service.
- The separate Play Next tool picks from the user's filtered library and avoids immediately repeating a game when alternatives exist.

### Current source coverage
| Source | Implemented behavior and important limits |
| --- | --- |
| Steam | Public store catalogue/search/details, ZA pricing, and critic scores where Steam supplies them; verified Steam identity sign-in |
| GOG | PC catalogue/details, regional prices, available requirements and related products; absent artwork fields do not invalidate the whole feed |
| Xbox Console | Microsoft catalogue with qualifying public ZA full-game purchase quotes; incompatible/member-only/trial/subscription offers are excluded from game prices |
| Xbox PC | Separate Windows PC listings and qualifying ZA quotes; available PC requirements |
| Nintendo | UK catalogue metadata for discovery, with exact product IDs matched to supported South African digital pricing; not every legacy title has a usable quote |
| Epic Games Store | Full catalogue pagination when permitted, otherwise clearly labeled promotions-only fallback; full live coverage was previously blocked by HTTP 403 |
| PlayStation | Official store links; live catalogue unavailable in the current server integration |
| RAWG | Optional multi-platform metadata/critic-score source; requires configuration and does not provide game purchase prices here |

### Deals and subscriptions
- Deals combine supported Steam, GOG, Xbox Console/PC, Nintendo and Epic sources.
- Storefront and budget controls include a custom decimal amount.
- Providers paginate independently. A failure in one source does not discard successful results from the others.
- Displayed discounts require real qualifying current/original ZAR amounts. Unknown prices stay unknown.
- Nintendo deal discovery is not guaranteed to capture every ZA-only sale.
- Subscription comparison distinguishes platforms and billing periods.
- Subscription prices can be live, dated references or unavailable. Reference prices must not be presented as fresh checkout quotes.
- Price history uses genuine stored observations; no invented chart history is generated.
- Price-alert evaluation records trigger status from stored prices. It does not imply email or push delivery.

## 5. Game details

Depending on the provider's available data, game pages include:
- Title, cover/hero artwork, description and basic metadata.
- Genres, supported platforms, developer, publisher and release information.
- Critic scores where supplied, without inventing missing scores.
- Storefront purchase links; applicable Steam store/app links.
- Supplied screenshots and trailers, with no automatic trailer playback.
- Minimum/recommended PC requirements grouped by operating system where supplied.
- Expandable editions, bundles and DLC information using actual provider relationships and storefront destinations.
- Library/favorite controls and personal status, rating, hours and notes.
- Regional price history and eligible price-alert actions.
- Community reviews with spoiler controls and interactions.

Requirements, add-ons and media may be unavailable for some sources. Partial results have separate loading/error states and should not prevent the base game page from being useful.

## 6. Personal library, backlog and private records

### Library and backlog
- Add/remove games, mark favorites and browse a personal collection.
- Five statuses: Want to Play, Currently Playing, Completed, On Hold and Dropped.
- Personal 0-10 ratings, recorded hours and private notes.
- Search, status filtering, sorting and grid/list presentation.
- Completion dates, priorities and membership in private collections.
- Dashboard totals, status breakdown, genres and rating distribution.
- Compare selected games using available metadata and prices; missing values remain missing.

### Private journal and annual summaries
- Dated play sessions and private review entries.
- Minutes played, notes, progress, tags, ratings and spoiler flags.
- Authenticated journals use indexed MySQL records, pagination/search and per-entry revisions.
- Annual Gaming Wrapped uses explicit dated activity/completions rather than spreading lifetime hours across years.
- PNG export is generated locally with disclosure choices, not uploaded automatically.
- Upcoming release browsing and watchlists distinguish exact days from vague dates such as quarters or Coming soon.
- Watched release information refreshes through explicit user actions; no background release-alert delivery is claimed.

### Guests versus accounts
- Guests can maintain separate device-only library/workspace data in browser storage.
- Signed-in users load their own MySQL account data.
- Signing in does not silently publish or upload the device collection.
- Explicit import preserves the device backup and prefers existing account records on conflicts.
- Signing out restores the separate guest/device context.
- Late account responses are guarded so they cannot populate another session.

## 7. Social profiles and community

### Profiles and relationships
- Unique normalized usernames and profile URLs, display names, biography, avatar and banner.
- Private by default, with explicit library-sharing settings.
- Minimal identity cards remain discoverable so users can find accounts and request to follow them.
- Shared library titles/statuses/favorites, gaming counts, recently updated completed games and achievement showcases.
- Follow/unfollow, follower/following lists and private-account follow approval/decline.
- Blocking filters interactions in both directions and revokes affected collection collaboration.
- Username aliases preserve old profile links and reserve previous handles against takeover.
- Player suggestions use overlap with explicitly public shared libraries; private libraries are not mined for another user's suggestions.

### Activity and reviews
- Chronological public and following feeds, profile activity and pagination.
- Events originate from saved actions such as library additions/completions/favorites, published reviews/collections and achievement unlocks.
- Current privacy, block and publication visibility are checked when reading the feed.
- Community reviews are separate from private journal reviews and require explicit publication.
- One community review per account/storefront game, with rating, title, text and spoiler flag.
- Search, newest/highest-rating sorting, likes, reporting and versioned owner editing/deletion.
- Administrator report triage can hide a review or dismiss reports. This is basic moderation, not a full ban/appeal system.

### Collections and collaboration
- Private workspace collections remain separate from published/shared collections.
- Users explicitly create a publication, optionally starting from a private collection.
- Publications have a name, description, theme, cover, selected games and shareable URL.
- Collections can be private to their owner or shared with authorized profile viewers.
- Owner invitations grant viewer or editor roles only after acceptance.
- Accepted members may access the invited collection without receiving access to the owner's private profile or library.
- Editors can edit content with version checks; they cannot change visibility, delete the collection or manage membership.
- Owners can revoke access; members can decline or leave. Blocking revokes affected membership.
- Collection following and administrator-curated featuring are implemented.
- Intentional limits: up to 100 games and 25 collaborators per shared collection.

## 8. Customization, artwork, achievements and notifications

### Personalization
- Accent choices, compact/comfortable presentation and reduced-animation preference.
- Dashboard statistics/status/genre/rating widgets can be shown, hidden and reordered.
- Homepage discovery sections can be shown, hidden and reordered; recommendations have their own visibility switch.
- Preferences persist per account through revisioned saves.
- There are currently both legacy private preferences and the newer social studio. Consolidating their purpose is a useful design review topic.

### Artwork
- Remote HTTPS avatar/banner/collection-cover URLs are supported.
- Local PNG/JPEG/WebP uploads are validated, decoded, metadata-stripped, resized and re-encoded as WebP using Sharp.
- Limits: 2 MiB input, 16 million input pixels and 20 saved images per account; output fits within 1920x1080.
- Owners can manage/delete their uploaded images.
- Uploaded artwork is deliberately PUBLIC BY URL, even if a profile is private. The upload UI explains this. It is not private screenshot storage.
- Deleting an image breaks any saved profile/collection references to it.

### GameVault achievements
- First Game Added, First Review Published, Ten Games Completed, Fifty Games Collected, Backlog Explorer, Genre Specialist, Collection Curator and Gaming Historian.
- Progress comes from server-stored account activity; unlocks are unique and timestamped.
- These are participation awards based partly on user-maintained statuses/metadata, not anti-cheat-certified achievements.
- Rarity uses real visible public-profile/unlock counts and shows its population; it is unavailable if the population is empty.

### Notifications
- In-app notifications for followers, follow requests, review likes, achievements and collection invitations.
- Unread count, individual/all read actions, paginated inbox and notification preference.
- Visible-page polling rather than a new WebSocket system.
- No configured email or push delivery.

## 9. Steam account and library integration

- Steam sign-in/account linking uses verified Valve OpenID, not Steam passwords collected by GameVault.
- Linking tickets and login exchange codes are short-lived and one-use.
- A Steam identity already associated with another GameVault account is rejected; there is no silent account merge.
- Owned games match by exact Steam app IDs/storefront slugs, not fuzzy cross-store ownership guesses.
- Imports create missing library entries and preserve every existing manually maintained status, note, rating, favorite and hours field.
- Available Steam observations/playtime are also stored in separate private snapshots.
- Sync status, manual retry and disconnect are available; a database lease prevents normal overlapping syncs.
- Private/incomplete Steam responses fail explicitly and do not erase the user's collection.
- Supported achievements can be imported per synchronized owned app and viewed later from saved private snapshots.
- Disconnect retains previously imported library entries. A later explicit Steam sign-in may reconnect a Steam-only identity.
- Live owned-library/achievement calls require STEAM_WEB_API_KEY and authorized Steam visibility. They have fixture/database coverage, but live acceptance with real credentials remains outstanding.

## 10. Technical background

| Area | Current implementation |
| --- | --- |
| Frontend | Vue 3 Composition API, TypeScript, Vite, Vue Router, Pinia, Axios |
| Styling | Existing custom CSS/design tokens, dark palette and responsive layouts; do not assume the historical proposed Tailwind stack is active |
| Charts/export | Chart.js for price history; browser-generated annual PNG export |
| Backend | Node.js, Express 5, TypeScript, Zod validation |
| Database | MySQL with Prisma 6, migrations and generated client |
| Authentication | bcrypt password hashes, signed seven-day bearer JWTs and verified Steam OpenID |
| Image processing | Sharp for normalized uploaded artwork |
| Testing | Node unit/API tests, opt-in real MySQL integration tests, isolated Edge browser smoke suite |

The project is an npm workspace with frontend and backend directories. API code lives in backend/src, schema/migrations in backend/prisma, Vue pages/components/stores in frontend/src, and implementation records in docs.

Important storage boundaries:
- LibraryEntry: user/game snapshots, status, favorite, personal rating, hours and notes.
- UserWorkspace: private preferences, collection membership/metadata and watchlists with optimistic revisions.
- JournalRecord: indexed private sessions/reviews with independent revisions.
- SocialProfile and UsernameAlias: social identity, privacy and customization.
- FollowEdge and BlockEdge: indexed relationships.
- CommunityReview, ReviewLike and ReviewReport: explicitly published reviews/interactions/moderation.
- PublishedCollection, CollectionMember and CollectionFollow: shared content and accepted permissions.
- SocialActivity, AchievementUnlock and SocialNotification: social events/progress/inbox.
- SteamConnection and SteamGameSnapshot: verified connection and private imported observations.
- ArtworkUpload: normalized image bytes and ownership.
- Existing canonical Game, store/listing/price, wishlist/alert and sync-log tables remain separate from live storefront snapshots.

This distinction matters: a game saved from a live storefront is not necessarily present in the canonical Game/StoreListing tables used by older wishlists and alerts. Those actions can be unavailable until a corresponding regional database listing exists.

Security and persistence use validated input, server-derived ownership, version checks, unique constraints, transactions, bounded requests and pagination. Text is escaped rather than rendered as arbitrary user HTML. Social visibility must be enforced on the server, including direct URLs and feeds.

Secrets remain server-side. Main configuration includes DATABASE_URL, JWT_SECRET, FRONTEND_ORIGIN, PUBLIC_API_ORIGIN and optional provider keys. VITE_API_URL is a public browser API URL, not a secret. Never include real credentials or user data in an improvement prompt.

## 11. Quality baseline and operational boundaries

The most recently recorded verification, from the completed implementation follow-up, reports:
- 69 backend tests passing with MySQL fixtures enabled.
- 17 frontend tests passing: 86 tests in total.
- Browser regressions passing for core account/library/journal/deals/social flows, preference persistence and representative desktop/mobile widths down to 320 pixels.
- Production builds, type checks, formatting/whitespace checks and Prisma validation passing.
- Eight local database migrations applied.
- Zero known npm audit vulnerabilities at that check.

These are recorded development checks, not a new test execution for this document, a guarantee of provider uptime or a production certification.

Known operational boundaries:
- No production deployment or load/SLO guarantee is established by these records.
- Browser JWT storage remains the existing token design.
- OpenID state/login exchange and rate-limit state are process-local; multiple replicas need shared state or appropriate affinity.
- Hosting still needs HTTPS, deployment-specific CSP, monitoring and backups.
- No complete WCAG/screen-reader certification, penetration test or mature moderation operations program is claimed.
- Genre/achievement calculations and some offset-paginated lists may need more work at substantial scale.
- Bounded recommendation candidate pools, supported provider feeds and missing observations must not be presented as exhaustive global data.

## 12. Useful areas for an improvement proposal

The following are review opportunities, not claims that every area is broken:
1. Clarify the product's main purpose and the first useful action for a new visitor.
2. Simplify navigation across discovery, personal tracking, community, account and customization.
3. Consolidate private preferences/social studio and clarify library versus wishlist versus watchlist.
4. Improve visual consistency, spacing, typography, hierarchy and reusable component patterns.
5. Improve discovery/search relevance and make loaded-page versus whole-catalogue filters unmistakable.
6. Improve provider coverage labels, price freshness, unavailable-data states and recovery paths.
7. Clarify private versus published content, collaboration permissions and public-by-URL artwork.
8. Strengthen community onboarding, moderation/report handling and useful feed empty states.
9. Improve mobile/keyboard/screen-reader behavior, contrast, focus management and reduced-motion behavior.
10. Evaluate performance using measurements: API/query cost, image loading, perceived responsiveness and layout shifts.
11. Define a sustainable canonical metadata/price observation pipeline for alerts and historical comparisons.
12. Plan live integration acceptance and deployment operations separately from UI implementation.

A reviewer should prioritize by user benefit, severity, effort and dependencies rather than propose another indiscriminate full rebuild.

## 13. Instructions to include in the next improvement prompt

Ask the next assistant or reviewer to:
- Treat this as an existing application and inspect current source before implementation.
- Distinguish implemented features, provider/configuration limitations and proposed new features.
- Preserve existing user data, guest/account separation, privacy and ownership boundaries.
- Reuse the Vue/Express/Prisma architecture and existing components where sensible.
- Avoid fabricated prices, scores, users, achievements, notifications or successful synchronization.
- Never publish private journal content automatically or broaden collection permissions implicitly.
- Prefer incremental, reviewable changes with appropriate migrations and regression tests.
- Do not deploy, use paid services, send external messages or run destructive migrations without authorization.
- Explain required credentials/configuration without requesting secrets in chat.
- Provide concrete user journeys, affected pages, implementation steps, acceptance criteria and verification methods.

### Ready-to-copy request for generating an improvement prompt

> I am attaching a product and technical brief for my existing GameVault application. Read it as current project context. Help me create a high-quality implementation prompt for improving the site, rather than rebuilding it from scratch.
>
> First identify the highest-value improvements to usability, visual consistency, discovery, personal tracking, social features, accessibility, performance and data reliability. Separate confirmed limitations in the brief from assumptions that require repository inspection or user research.
>
> Prioritize recommendations by impact, effort, risk and external dependencies. Then write a phased coding-agent prompt that preserves working features and user data, names the relevant pages and architecture, requires server-side privacy/authorization, and defines concrete acceptance criteria and tests for each phase. Keep credential-dependent integrations and production deployment requirements separate from work that can be completed locally. Do not propose features already implemented as if they are missing.

## 14. Supporting project records

This brief consolidates the latest repository implementation records, storefront source definitions and routes. For a developer with repository access, useful supporting files are:
- docs/GAMEVAULT_2_0_COMPLETION.md: latest social follow-up and verification.
- docs/GAMEVAULT_2_0_REPORT.md: original social implementation and integration limits; its initial omissions are superseded by the completion follow-up.
- docs/GAMEVAULT_ARCHITECTURE.md and docs/GAMEVAULT_JOURNAL_STORAGE.md: architecture and private journal normalization.
- backend/prisma/schema.prisma: actual database model.
- backend/src/integrations/sources.ts: storefront coverage declarations.
- frontend/src/router.ts: current application routes.

Older README/roadmap sections include historical plans. Do not interpret those older plans as the current implementation status when they conflict with newer code and completion records.
