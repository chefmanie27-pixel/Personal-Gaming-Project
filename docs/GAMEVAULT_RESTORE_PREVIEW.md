# GameVault read-only restore preview

Preferences accepts the version-1 private-data JSON export and requires an explicit account/device destination. Processing the selected file is local. Account comparison fetches a complete authenticated snapshot through GET /api/private-export; device comparison reads persisted localStorage. Neither comparison writes data, downloads a replacement file or sends the selected file to the server. Unsaved drafts are outside the comparison.

Validation checks UTF-8, format/version, source/consistency, private record shapes, unique identifiers, references and permitted links. Limits are 32 MiB, depth 40, one million inspected nodes and 100,000 entries per collection. Existing workspace metadata limits remain enforced. A normalized journal is validated independently of the 2,000-row embedded-storage limit and is never truncated.

Eight summary rows show records in the file, additions and existing keys kept in the destination: library, journal, collections, goals, watches, metadata, feedback and alert-rule preferences. Profile and destination preferences remain authoritative in the hypothetical comparison. Conflicts use exact identifiers, not title similarity or database collation. Compatibility notices flag legacy IDs, unsupported account fields and projected embedded-storage limits. These notices do not transform the file.

Malformed source files and unavailable destination data produce explicit errors. Pending saves/imports block starts. Clearing or replacing a file, changing destination, account/session changes and component disposal invalidate obsolete work. Selected game images, notes and executable content are not rendered.

The preview is advisory. There is no apply action. A future implementation must revalidate ownership, current revisions, database conflict semantics, capacity and references before any transaction, then provide explicit destination confirmation and recovery behavior. Stored revisions in a file are never write authority.

Validation is covered by frontend parser/comparison and scoped-operation tests, including 2,101 normalized journal entries and unchanged source/destination data. Full assistive-technology, production resource and actual restore acceptance remain outstanding.

Saved store changes invalidate an active comparison. Relevant device-storage events, returning window focus and returning document visibility also discard counts and require a fresh preview while retaining the selected file. This cannot detect arbitrary remote edits while a page stays active; server revalidation remains necessary. See GAMEVAULT_RESTORE_TRANSACTION_DESIGN.md for the proposed commit boundary.
