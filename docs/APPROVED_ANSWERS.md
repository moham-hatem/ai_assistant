# Local approved-answer store

Approved answers are durable, versioned records in `data/question-log.sqlite`. They are created only
by an `approved` teacher-review decision. Saving the decision, final review status, audit event, new
approved-answer version, and retirement of the prior active version is one `BEGIN IMMEDIATE` SQLite
transaction. If any approved-answer write fails, the entire approval is rolled back.

## Domain and matching

Each version stores the original question, its deterministic normalized form, answer language,
approved text, JSON evidence references, source review and decision IDs, monotonically increasing
version, active/retired state, reviewer, approval/creation timestamps, and retirement/supersession
metadata. Published fields are immutable; the only permitted update retires an active version while
linking it to its replacement. Rows cannot be deleted.

Normalization applies Unicode NFKC, removes Arabic vocalization and tatweel, lowercases, replaces
punctuation with spaces, and collapses whitespace. Lookup requires equality on both the complete
normalized question and requested answer language. It does not perform token, semantic, or fuzzy
matching.

An approval without `correctedAnswer` uses the linked answered question log's original answer. An
approval with `correctedAnswer` uses the trimmed correction. Approved-answer creation requires at
least one evidence reference. `rejected` and `needs_changes` decisions never create a version.

## Request-time safety

`AnswerService` accesses storage through `ApprovedAnswerRepository` and validates references through
`ApprovedAnswerEvidenceValidator`; it does not read SQLite, book state, or files directly. The local
validator resolves every stored reference against the current `PublishedEvidenceSource`. Thus a
missing chunk or an edition that is now `archived`, `rejected`, or otherwise unpublished invalidates
the candidate. Partial validation is not accepted.

When the exact candidate and all evidence are valid, `AnswerService` returns it before knowledge
search or model generation with provider `approved-answer`, model `approved-answer/v<version>`, and
the original evidence references. When no valid candidate exists, it follows the normal retrieval and
AI path. Repository or validation failures are isolated and also fall back to that normal path.

## Migration and operational limits

Versions are recorded in `approved_answer_schema_migrations`. Migration 1 creates the immutable
tables/indexes/triggers and backfills existing eligible approved review decisions in decision-time
order. Existing approvals without a usable answer or evidence references are deliberately skipped;
they cannot safely become grounded answers.

The current local review API still accepts an operator-supplied `reviewerId`; there is no production
authentication or authorization yet. There is no UI for browsing approved versions, no fuzzy or
semantic approved-answer matching, and no automatic review-queue item when evidence later becomes
invalid. Invalid answers simply stop receiving priority until a later reviewed approval is created.
