# Improvement roadmap - checkpoint 3 November 2026

The original six-phase program remains the scope. This checkpoint completes tested increments, not every acceptance criterion. Existing routes, private data and uncommitted work were preserved.

| Phase | Delivered | Status and outstanding work |
| --- | --- | --- |
| 0 | Repository audit, baseline and safety boundaries | Complete for current implementation; audit is not a security certification |
| 1 | Grouped desktop navigation, mobile quick links, keyboard closing/focus, welcome/onboarding, saved status badges, shared surface/focus tokens and UiState | Core complete; full detail-page hierarchy review, all empty/loading states and full accessibility audit remain |
| 2 | Private interested/dismiss/less-like feedback, deterministic bounded diverse ranking, reasons, reset, session novelty, loaded-catalogue budget/release filters and counts | Core complete; exhaustive provider-wide filtering and broader relevance evaluation remain |
| 3 | Atomic bulk statuses, private dated goals, target dates, daily calendar, monthly activity/timeline, Play Next priority/status | Partial; year-over-year analytics, richer Wrapped, historical backlog ledger and more bulk operations remain |
| 4 | Exact provider reconciliation, genuine quote timestamps, honest price-history table/chart, freshness/coverage, private advanced rules, deduplicated in-app delivery, bounded/backoff jobs | Partial; default-off durable scheduling and private history are implemented/tested. Activation/staging acceptance and external delivery remain. Duplicate-safe alert creation/target edits are verified |
| 5 | Review categories, collection ordering, private opt-in monthly challenges, discussion/reply API and UI, reports and audited admin decisions | Partial; discussions tested but default-off on existing DB. Reply editing, direct-thread selection, cursor and core moderation browser checks are now verified. Richer challenge/community surfaces, moderator policy/appeals and broader accessibility coverage remain |
| 6 | Generated request IDs, sanitized structured HTTP errors/completion logs, cached bounded readiness response, shutdown/draining, current database admin roles, dependency audit and operational instructions | Partial; real hosting/CSP acceptance, backup/restore drill, shared rate-limit/OpenID state, durable-mode staging activation, load measurements, alerting integration and accessibility certification remain |

## Next implementation order
1. Completed follow-up: discussion reply editor with stale-draft preservation, direct thread URLs outside the loaded page, access-error clearing, tied-timestamp cursor regressions and browser report/moderation/history flows. Discussions remain default-off on existing data.
2. Duplicate-safe alert creation is complete: account-row locking serializes repeated creates, paused/rule state is preserved, and target collisions are rejected. Durable singleton scheduling and delivery history are now implemented behind DURABLE_ALERTS_ENABLED=0, with lease/cursor/retry/atomicity and private-history tests. Operational activation remains pending.
3. Expand genuine year-over-year analytics and Wrapped using recorded dated sessions/completions, with explicit unavailable history.
4. Complete UI/accessibility review and representative route performance measurements; do not extrapolate fixture timings to production.
5. Operator-specific staging: reviewed database backup/restore rehearsal, migration approval, TLS/proxy/CSP configuration and authorized provider acceptance. No production deployment is authorized.

Resume instruction: Read this roadmap, GAMEVAULT_IMPLEMENTATION_PROGRESS.md and GAMEVAULT_TEST_RESULTS.md; inspect the existing dirty tree before edits. Continue item 3 with genuine year-over-year analytics and richer Wrapped, using recorded dated data only. Durable mode remains disabled on existing data until reviewed migration/authorization. Do not apply migrations to the configured database or enable discussions there without the required review/authorization.
