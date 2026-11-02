# GameVault 2.0 implementation plan

## Baseline audit
Vue 3, Pinia, Vue Router, Vite and TypeScript; Express 5, Zod, Prisma 6 and MySQL. Passwords use bcrypt; seven-day signed bearer JWTs are stored by the existing browser client. Steam OpenID verifies identities through Valve and exchanges one-use login codes. There is no email or push delivery infrastructure. Authentication uses a bounded process-local IP limiter. Production configuration requires explicit secrets and HTTPS origins.

LibraryEntry holds private user/game snapshots. UserWorkspace holds private preferences, collections and metadata with optimistic revisions. JournalRecord holds private sessions/reviews with independent revisions and cursor pagination. Existing Review is critic-source data, not community content. No private content will automatically become social content. Existing storefront integrations, alerts and journal migration remain intact. Existing design tokens, lazy routes and accessible native controls will be reused. Tests include Node API/unit tests, opt-in MySQL integration tests and Playwright browser smoke flows. No deployment pipeline is present. Working tree was clean at baseline.

## Order and storage
0. Audit and baseline tests.
1. Opt-in SocialProfile with unique normalized username, default private visibility, explicitly selected library visibility and versioned edits. Public DTOs exclude email/password/journal/private notes.
2. Indexed FollowEdge and BlockEdge, pending private follows, owner-only request approval.
3. Indexed SocialActivity, generated transactionally by successful public actions and library hooks; current privacy checked on every read.
4. CommunityReview separate from private journals, versioned publishing, likes, reports and admin moderation.
5. Verified Steam connection and official Web API import; preserve manual library fields. Missing credentials produce an explicit unavailable status.
6. PublishedCollection snapshots, independent of private workspace collections, owner editing and follows.
7. Persist customization in social profile settings and apply supported layout/motion/accent choices.
8. Verified database-derived achievements with unique unlocks.
9. Owner-scoped paginated in-app notifications and preferences.
10. Type/build, API/privacy/database/browser checks and dependency audit.

All new tables use additive migrations and user foreign keys. No destructive downgrade or deployment is authorized. User-supplied remote artwork accepts HTTPS only; no file uploads or server-side image fetching. Render all text with Vue escaping. Public social responses use no-store while privacy changes are frequent. Paginated queries have bounded page sizes and indexed date/id ordering. Block relations are checked in both directions. Existing user IDs come only from verified JWTs. Rate limits remain process-local and require a shared backend for multiple replicas.

## Verification strategy
Run baseline and phase tests, then production build. Exercise anonymous/authenticated access, uniqueness, profile revisions, private accounts/follow requests, mutual block filtering, ownership, likes/reports, notifications, safe DTO projection and duplicate action retries. Use temporary database users for integration tests and remove only those fixtures. Test Steam via official-contract fixtures; do not claim live synchronization without credentials. Document incomplete capabilities accurately in GAMEVAULT_2_0_PROGRESS.md.
