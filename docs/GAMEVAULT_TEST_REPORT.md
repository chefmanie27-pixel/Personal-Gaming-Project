# Verification report

## Baseline

Production build passed. Backend: 41 passed, one optional MySQL test skipped. Frontend: six passed. Existing uncommitted work was preserved.

## Final automated coverage

- Production build and TypeScript checks passed after feature and dependency changes.
- Backend suite: 44 passed; two real-database tests intentionally skipped in the default command.
- Frontend suite: 12 passed, including recommendation signals/cold start, filtered randomness, exact-date parsing, annual boundaries, guest/account separation, failed saves and late responses.
- Both optional real MySQL tests were executed separately and passed with temporary accounts removed afterward. They cover library ownership/persistence and private workspace persistence/concurrent version protection.
- Final full-repository npm audit reported zero vulnerabilities; baseline was seven (four high, three moderate). See GAMEVAULT_DEPENDENCY_AUDIT.json.
- No lint command is configured. The production build includes backend TypeScript and frontend vue-tsc checks.

## Browser execution

The Edge/CDP smoke suite uses deterministic HTTP fixtures and isolated profiles. It exercises actual rendered controls for guest library and account import/persistence, status/favorite/journal edits, authenticated workspace import, private review create/edit/delete, spoiler disclosure, safe text rendering, collections, random selection, two-game comparison/swap, watchlist persistence, view-preference persistence, local PNG generation, multi-store deal pagination/budgets, search empty/error/retry, mobile navigation and sign-in focus/Escape behavior. Fifteen public routes are checked at 1440, 1024, 768, 390 and 320 pixels for page overflow. This does not constitute a full WCAG audit, device-lab test or live Steam-account sign-in.

Live checks additionally confirmed the upcoming endpoint returned real Steam announcements. Distant placeholder dates were identified and are treated as tentative, rather than calendar dates.

## Intermediate failures corrected

A release-date test found a one-day local-time shift and was fixed using explicit calendar parsing. Browser fixtures were updated for the new status controls/workspace/upcoming routes. A review assertion that raced the network response was changed to wait for visible content. These failures were not counted as successful checks.

## Commands

npm run build
npm test --workspace backend
npm test --workspace frontend
npm run test:ui --workspace frontend
npm audit

For real MySQL tests, run from backend with GAMEVAULT_DATABASE_TESTS=1: node --import tsx --test tests/libraryDatabase.test.ts tests/workspaceDatabase.test.ts. The test harness requires Edge or an EDGE_PATH override.

## Remaining verification limits

External Epic full-catalogue challenges, email delivery and unavailable source fields are not solved by fixture tests. No live email reminder/reset, production deployment, load test or exhaustive accessibility certification is claimed. Payload limits and process-local rate limiting are documented; normalize large journals and use distributed limits before scaling beyond this bounded design.


## Journal normalization follow-up (supersedes suite counts above)

Backend: 46 passed, 3 opt-in database tests skipped by default. Frontend: 15 passed. All 3 optional MySQL tests were executed separately and passed. This is 64 passing named tests across those runs. The journal database test verifies legacy backfill and rollback on invalid data, source/user ownership, pagination, idempotent imports and creates, revision conflicts, compact private summaries and 2,104 entries. The expanded browser suite checks normalized import/CRUD, 53-entry pagination/search, selected-year summary rendering and duplicate-safe retry after a simulated committed-but-lost response. Build/typechecks and final browser results are recorded in the execution log.

Journal search compatibility is also verified against MySQL: case-insensitive partial tags, partial dates, and literal percent/underscore/backslash queries return the expected records. Search projection migration 20261102160000_journal_search_text is applied locally.
