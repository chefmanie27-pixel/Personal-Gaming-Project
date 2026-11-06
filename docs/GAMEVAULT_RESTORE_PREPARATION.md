# Account restore preparation API

Implemented: POST /api/private-restore/prepare. This authenticated endpoint is read-only. It is not called by the current Preferences preview, which continues to process selected files locally. There is no apply endpoint or restore write transaction.

## Request

Content-Type must be application/json. The strict envelope contains destination: account, policy: destination-wins-v1, uploadConsent: true and backup: the complete parsed version-1 private-data document. Client-provided user IDs and query parameters are rejected. The authenticated token supplies ownership. A future UI must explicitly explain private-file upload and obtain consent before calling this endpoint. A boolean request field is a protocol requirement, not evidence that a UI has explained consent.

Authentication precedes JSON parsing. The entire uncompressed request is limited to 32 MiB, including its envelope; compressed requests and invalid UTF-8 are rejected. Backup traversal is bounded at depth 40, one million nodes and 100,000 keys/entries per container. Unsafe object keys, unsupported versions/shapes, duplicate keys by record identity, broken collection references and invalid account field values fail validation. Account schemas must not silently trim notes or strip snapshot/workspace extensions. Valid readable legacy files may therefore be incompatible with preparation. No conversion or truncation occurs.

Preparation reads the complete account snapshot through the already tested read-only export repository. Normalized destinations are supported; legacy or absent-workspace destinations require explicit future compatibility work and currently return a conflict. The comparison includes full journals beyond 2,000 rows, not loaded frontend pages. Combined metadata limits, record counts and 32 MiB encoded-document capacity are checked. Exact identifier conflicts retain destination values. Profile and ordinary preferences remain in the destination; new feedback and alert-rule keys are summarized. Case-only ambiguities are rejected conservatively. This does not simulate every configured database collation rule.

## Response and verification

A successful no-store response contains eight category counts, destination-wins-v1 policy, expiry, a signed planToken, a database-revalidation warning and applyAvailable: false. It contains no source notes, snapshots or write payload. The token is integrity-protected, not encrypted; its payload includes an account identifier and source/destination digests. Avoid logging or sharing it.

HMAC-SHA256 uses the existing server secret with a purpose-specific payload. The ten-minute plan binds user, policy version, source content and the complete destination content, including private library fields, normalized journal content/revisions and workspace metadata/revision. Deterministic object encoding and record ordering avoid false conflicts from key ordering, record order and changing export creation time. File revisions are never write authority.

verifyRestorePlan checks signature, expiry, user and recomputed source/destination plans. It is currently a tested helper, not an authorization endpoint. A future apply implementation must call it against authoritative data inside its write transaction and prove database isolation/collation behavior. The snapshot can change immediately after preparation; this plan does not reserve or lock account data. Signing a plan does not imply that application is enabled or that a write will succeed.

400 indicates an invalid envelope or incompatible source shape; 409 indicates destination/merged-capacity/case ambiguity; 413 indicates a size limit; unavailable or incompatible complete account reads return a sanitized 503. No failed preparation creates a plan or changes data.

## Verification and remaining work

Five focused tests cover full 2,101/53 journal comparisons, all-data fingerprints, expiry/account/tamper isolation, transformations/legacy rejection, limits, explicit consent, authentication before parsing, real oversized and malformed UTF-8 bodies and unavailable destinations. Disposable MySQL coverage compares all persisted library/journal/workspace rows before and after preparation and detects a changed library note without a workspace version change.

Remaining: explicit upload/confirmation UI, transactional account application with rollback/concurrent-writer/collation tests, uncertain-completion recovery and a separate atomic/recoverable device-storage design. See GAMEVAULT_RESTORE_TRANSACTION_DESIGN.md. No existing database migration or staged-feature activation is part of preparation.
