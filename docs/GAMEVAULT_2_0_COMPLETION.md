# GameVault 2.0 completion follow-up - 3 November 2026

This follow-up extends the prior social release. The earlier report's omitted local product features are superseded by the features below; external-service and production-hosting limits remain explicit.

## Implemented
- Collection collaboration: owner invitations by username, explicit viewer/editor roles, acceptance/decline, owner revocation, member departure, and invitation notifications. Pending members cannot read private collections. Accepted viewers can read only; editors can edit content with a version check but cannot change visibility, delete the collection or manage membership. Owners retain all controls. Both directions of blocking revoke membership. Private-profile membership grants access only to the invited collection, not the owner's profile/library. Up to 25 collaborators per collection.
- Safe artwork uploads for avatars, banners and collection covers. Authenticated raw PNG/JPEG/WebP uploads are limited to 2 MiB and 16 million input pixels, decoded and re-encoded as still WebP using Sharp, stripped of metadata and resized within 1920x1080. SVG and unsupported/invalid content are rejected. At most 20 images per account, owner-only management/deletion, fixed content type/nosniff/sandbox headers and no image caching. Database storage avoids filesystem path handling. Artwork is deliberately public by unguessable URL and the UI says so before upload; never use it for private screenshots. Deleting an image breaks every saved reference to that image, with a confirmation first.
- Dashboard widgets: show/hide and accessible Move up/Move down ordering for statistics, status, genres and ratings. Homepage sections have independent visibility/order controls. Preferences persist through the existing revisioned profile save; unsaved drafts are isolated from current preferences. Existing show-statistics/show-recommendations switches remain compatible.
- Admin-curated featured collections: only current database administrators can feature/unfeature; feature eligibility and discovery require public collection and public profile visibility. Visibility filters continue to apply after featuring.
- Player suggestions ranked by exact storefront game overlap using only other players' explicitly public shared libraries. Self, followed/requested users, blocks and private profiles are excluded. Up to 200 candidates and 500 of the viewer's own saved game IDs are considered; the UI explains the shared-game signal. This is a bounded rules-based suggestion list, not a claim of ML recommendations.
- Achievement rarity from actual visible public-profile population and unlock counts. Private accounts are excluded; empty populations return unavailable rather than invented percentages. Rarity is shown in the studio with its denominator.
- Username aliases preserve old profile links after rename and reserve old handles against account takeover.
- Follow-request and block-management lists now paginate instead of stopping at the previous 100/500 limits.
- Previously imported Steam achievements can be viewed from saved private snapshots without another Steam API request; access remains owner-scoped.

## Persistence and dependencies
Migration 20261103120000_social_extensions applied locally. Adds CollectionMember, UsernameAlias and ArtworkUpload, and the PublishedCollection.featured flag; existing rows remain unchanged. User receives corresponding relations. No destructive migration, account merge, deployment or paid service was executed. Sharp ^0.35.5 is the only added direct dependency; package lock records platform binaries and transitive dependencies. No secrets were added. Prisma client regenerated. Temporary schema-diff baseline removed.

Backend: social.ts, new artwork.ts, index.ts, steamLibrary.ts, schema/migration, new artwork tests and extended social/Steam tests. Frontend: new ArtworkUpload, SocialExtras and DashboardWidget components, shared collection/studio/community/dashboard/home pages, social settings/types and expanded browser harness. Existing library/journal/storefront functionality is preserved.

## Verification
Incremental backend run: 69 passed, zero failed/skipped with MySQL tests enabled. Frontend: 17 passed. Production build passed. Image decoding/storage/ownership, collaboration role boundaries/revocation, alias reservation, featured permissions, rarity population and suggestion privacy are tested using temporary users. Browser verification and final checks are recorded below when completed. The npm dependency audit reports zero known vulnerabilities after adding Sharp.

## External requirements and operational limits
Live Steam synchronization still requires the operator's STEAM_WEB_API_KEY and an authorized user's Valve sign-in; existing fixtures validate the behavior but do not substitute for live acceptance. Do not paste credentials into chat. Email/push are not enabled, and no messages were sent: actual provider configuration, sender/subscription setup and delivery testing are absent. The requested in-app notification system is functional, including invitations. No claim of external delivery is made.

The local application is complete for these features. Multi-replica hosting still needs shared OpenID state/rate-limit storage (or affinity), deployment-specific HTTPS/CSP/monitoring and backups. No production SLA, full screen-reader/WCAG certification, moderation appeals/bans or automatic all-game Steam achievement sweep is claimed. Management and notification/API pagination are implemented; collection collaborators and artwork use intentional documented quotas. Uploaded artwork is public regardless of profile privacy by explicit product choice, while text/private journals and private collection content retain server-side access checks.

## Run locally
Use existing backend/.env and run npm run dev from the repository root. On a fresh checkout: npm ci; npm run db:generate --workspace backend; from backend run npx prisma migrate deploy; then npm run dev. Use /social/studio for customization, images and invitations; /community for featured collections and suggested players; a collection page for owner-managed collaboration. Existing report contains the original feature overview and detailed API/Steam setup.

Image-processing references: https://sharp.pixelplumbing.com/api-constructor/ and https://sharp.pixelplumbing.com/api-output/ (input pixel limits and re-encoding without retained metadata).

## Final follow-up results

- Backend with all MySQL fixtures enabled: 69 passed, zero failures/skips. Frontend: 17 passed. Total: 86 passing tests.
- Full browser regression suite passed, including persistent dashboard widget order/visibility and homepage section choices/ranking after navigation, plus prior account/social/journal/deals/mobile checks. Browser fixtures simulate separate user interactions and wait for account preferences to load.
- Production build and type checks passed; final backend output rebuilt after invitation-notification renewal handling. Formatting and whitespace checks passed.
- Prisma schema validated; all eight local migrations applied with no pending migration. No destructive migration or production deployment performed.
- npm audit after adding Sharp: zero known vulnerabilities. New direct dependency: sharp ^0.35.5.
- External blockers: live Steam acceptance requires an authorized account/key; actual email/push delivery remains unconfigured. These do not affect local in-app invitations, notifications or the completed social features.
