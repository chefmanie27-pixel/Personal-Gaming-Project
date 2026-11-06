# Private-data export contract v1

Implementation checkpoint: 6 November 2026. Structured export/download is implemented; restore is not implemented. The existing original-library and original-workspace TXT downloads preserve stored text for recovery and are separate features.

## Scope and format

The UTF-8 JSON file contains the persisted private library, workspace metadata and complete private journal for one selected source. It excludes credentials/tokens, linked-account secrets, public/social content, moderation/inbox history, the separate account wishlist, active price alerts and price-alert delivery records. The UI must name this scope rather than call it a complete account export. It must not publish or upload anything.

~~~json
{
  "format": "gamevault-private-data",
  "formatVersion": 1,
  "exportedAt": "2026-11-06T10:00:00.000Z",
  "source": { "kind": "account", "journalMode": "normalized" },
  "consistency": { "kind": "transaction-snapshot", "workspaceVersion": 42 },
  "data": {
    "library": [],
    "workspace": {
      "profile": { "name": "", "bio": "" },
      "preferences": { "genres": [], "platforms": [] },
      "collections": [],
      "metadata": {},
      "watches": [],
      "goals": []
    },
    "journal": []
  }
}
~~~

| Field | Contract |
| --- | --- |
| format / formatVersion | Exact discriminator and version; readers reject unsupported versions without changing source data. |
| exportedAt | UTC ISO timestamp of export creation; not a claim about when activity happened. |
| source.kind | device or account; a single file never silently mixes the two sources. |
| source.journalMode | legacy or normalized, describing the source layout before export. |
| consistency.kind | device-read for original browser storage reads, transaction-snapshot for one consistent account database read. |
| consistency.workspaceVersion | Persisted account workspace revision, or null for a device source or an account with no workspace row yet. |
| data.library | Complete private library snapshots with playing status, favorite, rating, hours, notes and addedAt. No publicGame stripping of private fields. |
| data.workspace | Profile, all preferences/rules/feedback, collections, metadata, watches and goals. Journal is excluded here to avoid duplicate representations. |
| data.journal | All journal rows, including private notes/progress/tags/ratings/spoilers/game snapshots. Legacy embedded rows or normalized rows are flattened into this one collection. Existing revision values may be preserved for provenance, never reused as authority during future restore. |

## Completeness and consistency

Account export must read library, workspace and normalized journal in one authenticated repository operation with a consistent database snapshot. Reusing the journal store entries would export only loaded pages. Reading three unrelated frontend endpoints cannot establish a consistent account snapshot. Normalized journal data must be fetched in bounded batches within that read, ordered deterministically by date and ID, until exhausted. It is not subject to the embedded device workspace limit of 2,000 journal rows.

Device export reads both storage keys directly, validates them without overwriting or silently filtering records, and uses embedded journal rows. Its consistency label explicitly does not promise a transaction across localStorage keys or browser tabs. Missing storage keys mean empty/default data; unreadable or malformed storage means export failure, not an empty backup. The original-text recovery downloads remain available independently.

Any failed, stale, unauthorized, malformed or incomplete read aborts export. No partial JSON file is downloaded and no unavailable dataset becomes an empty array. A normalized workspace must not also contribute a second embedded journal history. Exports preserve actual dated records and do not invent yearly activity from lifetime hours.

The implementation must impose a measured size/time budget. The implemented v1 total encoded budget is 32 MiB. If any dataset exceeds the budget, return a clear error before sending an attachment; never truncate rows to fit. Read bounded batches and account for encoded size incrementally. Read transaction timeout is 30 seconds with a maximum 5-second wait for a connection; the client timeout is 40 seconds. Encoded budgets are checked before attachment delivery. Do not treat the current 4 MiB workspace-storage cap as a total-account-export cap.

## Request and UI behavior

GET /api/private-export is a read-only authenticated export endpoint that derives ownership from the verified request user, never a requested user ID. It reads only that user's private rows, uses no-store responses, and does not change schema, migration state or staged feature flags. Return a JSON attachment only after the complete bounded snapshot is ready; errors do not return an export filename.

The frontend requires an explicit source choice and click, explains that the file includes private notes/preferences, prevents repeated pending downloads and blocks starts during unfinished imports or uncertain saves. Capture token/user/source when starting. Sign-out, account/source changes or disposal invalidate completion so no old account file can download later. Errors retain all original local/account data and offer retry. Unsaved form drafts are outside the persisted-data export and must not be silently included.

Suggested filename: gamevault-private-<source>-<UTC-date>.json. Do not include email addresses or tokens in filenames, URLs or logs.

## Restore boundary

A read-only restore preview is delivered in Preferences: selected files are validated locally and compared against complete saved account/device data. It displays counts and destination-wins conflicts without uploading or applying the selected file. See GAMEVAULT_RESTORE_PREVIEW.md. Applying a restore remains unavailable. Future restore must validate format/version, limits, ownership intent, identifiers and references before writes; preview conflicts and require an explicit account/device destination. Preserve original files/storage, maintain existing account-wins behavior unless the user chooses another reviewed policy, and handle legacy IDs explicitly. A read-compatible legacy snapshot is not automatically valid for the server's stricter import schemas. Do not apply stored row revisions as optimistic-lock authority. Failed or partially accepted batches require visible reconciliation and idempotent retry; do not claim rollback unless it is actually transactional.

## Required acceptance tests

- More than 50 normalized journal rows, including entries never loaded in the UI, are exported exactly once.
- Legacy/device journals and optional defaults retain all stored records and private fields.
- Account A cannot export B's rows; a late response cannot download after logout or switching accounts.
- Concurrent changes do not produce mixed account datasets; transaction failures and resource limits yield no attachment.
- Corrupt device data, failed reads, repeated cursors/batches and oversized output fail explicitly without mutation or truncation.
- Local UTF-8 download contents/filename, repeated-click protection, keyboard/focus behavior and mobile layouts are verified.

Repository/API ownership and budget checks, disposable-MySQL snapshot/read-only/large-journal checks, scoped frontend download tests and browser download/source-isolation checks cover this implementation. Full production load and assistive-technology acceptance remain separate. No deployment or existing-database migration is authorized by this document.
