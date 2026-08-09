# Teacher review backend

The local teacher-review queue is exposed under `/api/internal/reviews` and stored in the same
SQLite database as `question_logs`. A review stores only `question_log_id`; list and detail reads
join or load the immutable question log instead of copying the question, answer, evidence, channel,
or language into review tables.

## State and decision model

- `pending -> in_review` claims a review for `reviewerId`.
- `in_review -> pending` releases it and must name the assigned reviewer.
- A decision may be saved from `pending` (unassigned review) or `in_review` (assigned review).
- `approved` without `correctedAnswer` approves the generated answer as-is.
- `approved` with a non-empty `correctedAnswer` stores an edited, approved wording.
- `rejected` does not accept `correctedAnswer`.
- `needs_changes` asks for a change to the underlying content. It requires a clear `internalNotes`
  reason and does not accept or imply approved corrected wording.
- A single immutable decision is stored per review. Status and decision writes share one SQLite
  transaction, and optimistic status checks reject concurrent updates.
- An `approved` decision also creates a versioned approved-answer row in that transaction. The
  corrected wording wins when supplied; otherwise the question-log answer is used. `rejected` and
  `needs_changes` create no approved version. A later approval of the same exact normalized question
  and language creates the next version and retires the previous active version.

## Audit history

Every review detail includes ordered `events`. Creation, claim, release, other future status changes,
and decision saves append a `review_events` row in the same transaction as the state write. Decision
events reference `decisionId`; events carry only state, reviewer, and timestamp metadata and never
copy the question or answer. Database triggers reject `UPDATE` and `DELETE` against this table so
history cannot be silently rewritten through another local SQL path.

`reviewerId` is currently an operator-supplied string so the backend can be integrated before an
authentication system exists. It is not proof of identity or authorization and must be derived from
the authenticated principal when auth is added. No mock authentication is implemented here.

Channels, answer-language identifiers, and reviewer identifiers are open strings at storage and
contract boundaries. Review states and decision outcomes remain closed unions because they drive
domain invariants.

## Internal endpoints

- `GET /api/internal/reviews` supports `limit`, `offset`, `status`, `reviewerId`, `channel`, and
  `answerLanguage` filters.
- `POST /api/internal/reviews` creates from `{ "questionLogId": "..." }`.
- `GET /api/internal/reviews/:id` returns the review, linked question log, optional decision, and
  ordered audit events.
- `POST /api/internal/reviews/:id/status` claims or releases with `{ "status", "reviewerId" }`.
- `POST /api/internal/reviews/:id/decision` saves `{ "outcome", "reviewerId",
  "internalNotes"?, "correctedAnswer"? }`.

All request bodies reject unknown fields. IDs, enum values, pagination, string lengths, transition
rules, assignment ownership, and decision/correction consistency are validated on the server.

## Migration and rollback

Feature-specific versions are recorded in `review_schema_migrations`, avoiding interference with
other SQLite features. Each forward-only migration uses `BEGIN IMMEDIATE` and rolls back fully on
failure. Migration 1 adds the initial review and decision tables. Migration 2 updates the decision
checks and adds the append-only event log. Because the previous schema used `needs_changes` for a
corrected answer, migration 2 preserves such rows as edited `approved` decisions and seeds the
recoverable creation, claim, and decision history. It cannot invent claim/release events that were
already overwritten before event logging existed. Neither migration rewrites `question_logs`.

Operational rollback is to stop the application and restore the pre-migration database backup.
Dropping `review_events`, its triggers, `review_decisions`, `review_items`, and the `teacher_reviews`
migration rows is only appropriate when all review and audit data is intentionally being discarded.

Approved-answer schema history is tracked separately in `approved_answer_schema_migrations`; see
[APPROVED_ANSWERS.md](APPROVED_ANSWERS.md) for matching, request-time evidence validation, backfill,
failure isolation, and operational limits.
