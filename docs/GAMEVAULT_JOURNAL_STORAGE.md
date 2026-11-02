# Indexed account journal storage

## What changed

Authenticated sessions and reviews now live in JournalRecord instead of the workspace JSON document. Entries have their own revision numbers, user-owned compound primary key and date/kind indexes. This removes the account journal's 2,000-entry/4 MiB history restriction; metadata workspaces and device-only journals retain their existing bounds. No dependencies or service credentials were added.

The Journal page requests 24 entries at a time, offers Load more, debounces server search, filters by entry kind and preserves unsubmitted form drafts. Cursors order by date and ID, avoiding offset shifts when new entries are inserted. Search preserves the previous combined-text behavior across titles, notes, progress, tags and dates, including partial dates. SQL wildcard characters are escaped so searches stay literal.

## Migration

20261102150000_normalized_journal adds JournalRecord and UserWorkspace.journalMigrated. It has been applied to the configured local database. Migration 20261102160000_journal_search_text adds and backfills a private search-text column; it is also applied locally. Existing JSON histories are migrated lazily on the first authenticated workspace/journal request. A transaction validates the old document, claims its version, copies entries, then clears the JSON history and marks migration complete. Failure rolls back the entire operation. Repeated migration does not overwrite existing record edits. Invalid legacy data is retained for repair rather than discarded.

The workspace API advertises journalMode=normalized. Updated clients import guest journals through the dedicated endpoint, in idempotent batches of 25, then import remaining metadata. Account entries win on ID conflicts and guest backups remain unchanged. Import can partially complete if a later batch or metadata save fails; retry is safe because completed entries are not overwritten. Old clients attempting to save a nonempty journal through the metadata endpoint receive an error and must refresh.

For another environment: back up the database, apply Prisma migrations, and replace legacy server writers before allowing the new API to migrate accounts. Mixed old/new server writers are not supported. Regenerate Prisma before starting the updated backend. On Windows, stop/reload the backend first if its engine DLL is locked.

Downgrade is not automatic: stop writers and export normalized journal records before reverting application code. A history larger than the old limits cannot safely be reconstructed into the legacy bounded workspace. Do not drop JournalRecord or use the old workspace rollback artifact without a validated data-restoration plan. No destructive downgrade was executed.

## API

All routes require the existing Bearer token and disable caching of private responses.

- GET /api/journal: q, optional kind=session/review, limit=1..50, and returned JSON cursor. Returns data plus hasMore/nextCursor.
- POST /api/journal: creates a validated entry with a client-generated UUID. Exact same-ID retries return the existing record; changed content with that ID returns 409.
- PATCH /api/journal/:id: full validated entry plus expected version. Stale versions return 409; another user's row is never changed.
- DELETE /api/journal/:id?version=N: revision-checked deletion; an absent user-owned row is idempotent.
- POST /api/journal/import: up to 25 entries, preserving existing account records.
- GET /api/journal/summary?year=YYYY: yearly session minutes, monthly minutes, genre totals and compact highest-rated/most-played identities.

Summary calculation scans only the selected account/year in batches of 500. Private note/progress/tag text is neither fetched for aggregation nor returned in the summary. Game identities in the result omit descriptions and other large snapshot fields. Lifetime library hours are still separate from dated session time.

Creation forms keep the same UUID after uncertain responses, preventing duplicate retries. Editing retains the revision opened in the form even if list pages refresh. After a conflict, reload the list and choose Edit again; the old draft stays available to copy or reconcile. Session and summary request generations prevent stale responses from appearing in another account or selected year.

## Verification

Backend default suite: 46 passed, 3 optional database tests skipped. Frontend: 15 passed. The 3 real MySQL tests were also executed and passed using temporary accounts that were removed afterward. The journal database test verifies transactional migration, failure preservation, cross-user isolation, exact-year totals, compact summaries, duplicate-safe imports, revision conflicts and 2,104 records.

The Edge suite exercises the normalized API contract, explicit import, review CRUD, paginated loading of 53 entries, search, annual summaries and all existing responsive flows. A simulated failed response after a committed create verifies safe retry without an extra entry. Browser fixtures and real MySQL tests are separate; no real user notes are read for verification.

## Limits

Device-only journal history remains bounded by local storage and the legacy workspace format. Notes and individual record fields retain validation limits. Search uses an account-scoped private text projection and contains filters rather than a full-text index. Summary reads omit this projection as well as private notes. Extremely large annual histories may eventually benefit from precomputed aggregates. Email reminders still require a configured delivery provider; this change does not send notifications.
