# Improvement test results - final checkpoint, 3 November 2026

## Current verification
| Command | Actual result | Scope/limits |
| --- | --- | --- |
| node scripts/test-disposable.mjs (backend cwd) | 91 passed, 0 failed, 0 skipped | All backend unit/API/MySQL tests, all ten migrations in a newly created database; no existing database fixtures |
| npm.cmd run test --workspace frontend | 22 passed, 0 failed | Persistence/isolation, recommendation ranking/feedback, dated activity and existing frontend utilities |
| npm.cmd run typecheck | Backend/frontend passed | TypeScript and Vue types |
| npm.cmd run build | Backend/frontend passed | Local production build, not a deployment |
| npm.cmd run test:ui --workspace frontend | Passed | Edge/CDP fixture suite, existing application regressions plus navigation/deep-link reviews, feedback refresh/exclusion, atomic bulk request preserving notes, goals/calendar/timeline, real-history save/empty/error/retry/lazy chart and discussion create/reply |
| npm.cmd audit --json | 0 reported vulnerabilities | Current npm audit database; not a security certification |
| git diff --check | Passed | CRLF normalization notices only |

Browser suite tests routes at 1440/1024/768/390/320px and keyboard/dialog/navigation behavior. Fixture provider data is deterministic and does not constitute live storefront/credential acceptance. Screenshot: system temp gamevault-redesign-desktop.png. Discussion admin UI and complete accessibility acceptance are not comprehensively covered by browser tests yet.

## Disposable database safety and migration evidence
Latest successful database: gamevault_test_improvement_1793700263750_698c29. All nine migrations including 20261103150000_game_discussions applied successfully, then all 80 tests passed. Fresh disposable databases were created with unique names, retained for inspection and never dropped. Existing configured DB was neither migrated nor reset nor used for fixtures during this program.

Earlier checks progressed from baseline backend 50 passed/6 gated DB parents skipped and frontend 17 passed. Intermediate disposable runs passed 73 and 77 backend tests. A later discussion test run failed because its profile fixture omitted required fields; fixture corrected and the full 80-test disposable run passed. An admin template event typing error and a browser test selector quoting error were corrected; subsequent build and complete browser suite passed. These were local verification failures, not unreported production incidents.

## Tested boundaries
- Authenticated private ownership and account/guest separation, stale response/version rejection.
- Atomic bulk updates preserving other fields and users.
- Recommendation feedback validation/persistence/import and deterministic diverse ranking.
- Real dated activity and explicit unavailable summaries; no inferred playtime/history.
- Exact provider identity, cached quote deduplication and stale/missing quote handling.
- Alert freshness/region/currency/threshold/drop/low/cooldown and deduplicated preference-respecting in-app delivery; external transports disabled.
- Discussion strict inputs/default-off no-DB gate, private/follower/block access, replay safety, stale/foreign writes, categorized report deduplication, current-role moderator decisions/logs and soft deletion.
- Request ID generation/log-secret exclusion, generic readiness failures/cache and drained shutdown resource cleanup.

No production deployment, configured DB migration, external notification, production backup/restore drill, representative load/SLO test or full WCAG audit was performed. See roadmap and deployment readiness for remaining work.

Final Prisma validation: npx.cmd prisma validate from backend cwd passed with environment loaded, without database mutation. An initial root-directory attempt lacked DATABASE_URL; rerunning from the correct package directory resolved it. Final production build passed after the last UI edit. git diff --check passed. Configured .env is unchanged; no added private-key block in the tracked diff. No commit was created.

## Latest discussion follow-up verification
- node scripts/test-disposable.mjs (backend): 80 passed, zero failed/skipped; all nine migrations applied only to newly created gamevault_test_improvement_1793702448146_cb222f. Existing DB unchanged. Existing discussion parent test gained reply ownership/stale-write and tied-timestamp thread/reply cursor assertions.
- npm.cmd run test --workspace frontend: 22 passed.
- npm.cmd run typecheck and npm.cmd run build: passed.
- npm.cmd run test:ui --workspace frontend: passed, including reply draft conflict preservation/edit save, deep links with the selected thread absent from the list, report/admin-hide/moderation-history, unavailable-thread clearing and disabled-capability UI. Uses fixture role changes only; real permissions remain tested against MySQL.
- git diff --check: passed.
No schema/dependency changes during this follow-up; prior Prisma and npm audit results are historical checks from the same implementation checkpoint, not re-executed claims. Moderation policy/appeals, production activation, full accessibility and distributed jobs remain outstanding.

## Latest alert follow-up verification
- node scripts/test-disposable.mjs (backend): 83 passed, zero failed/skipped, all nine migrations in fresh gamevault_test_improvement_1793711788988_fdc5c0. New API tests include eight simultaneous requests across two router instances producing one row/one 201 response; strict cents/currency/ownership inputs; paused lastTriggered/workspace-rule preservation; distinct targets/accounts; collision-safe target edits; forbidden foreign updates/deletes and deleted-account rejection.
- npm.cmd run test --workspace frontend: 22 passed.
- npm.cmd run typecheck and npm.cmd run build: passed.
- npm.cmd run test:ui --workspace frontend: passed, including duplicate feedback, paused state, and a response failure after alert commit with retry reusing the row. Fixture syntax/routing issues were corrected before final success.
- git diff --check: passed. No schema or dependency change; previous schema/audit checks remain historical. Existing configured DB unchanged, all scratch DBs retained. No production deployment or external messages.

## Latest durable scheduler/history verification
- node scripts/test-disposable.mjs (backend): 91 passed, 0 failed/skipped, all ten migrations applied only to fresh gamevault_test_improvement_1793714082336_dd54f0. The helper now serializes files because global evaluator fixtures can otherwise affect other tests; explicit concurrent-worker assertions remain inside the durable suite.
- Final focused durableAlerts.test.ts rerun against that exact named disposable DB: 8 passed, including expired-worker delivery rejection. No configured database fixture/migration.
- Cases: five concurrent claims -> one lease; persisted cursor, expired lease reclaim and token fencing; atomic rollback of timestamp/notification/history on error; persisted retry delay/checkpoint; delivered versus disabled outcome; replay deduplication; competing runners -> one evaluation; private tied-date pagination; retained history after alert deletion and account-delete cascade.
- npm.cmd run test --workspace frontend: 22 passed. Root typecheck and production build passed; backend build repeated after final scheduler diagnostic correction passed.
- npm.cmd run test:ui --workspace frontend: passed, including history outage/retry/next page/disabled outcome/320px layout and existing routes.
- npx.cmd prisma validate (backend): valid. git diff --check: passed. No dependency changes; dependency audit results from previous checkpoint remain historical.
- Initial tests exposed MySQL 1213 deadlocks from concurrent INSERT IGNORE shared-lock upgrades within claim transactions. Initialization now commits before the locking transaction, with bounded deadlock retries; full/focused runs pass afterward. These are simulated worker recovery tests, not live production crash/load or external delivery acceptance.
