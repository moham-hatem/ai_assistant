# Teacher review backend

The local teacher-review queue is exposed under `/api/internal/reviews` and stored in the same
SQLite database as `question_logs`. A review stores only `question_log_id`; list and detail reads
join or load the immutable question log instead of copying the question, answer, evidence, channel,
or language into review tables.

## State and decision model

- `pending -> in_review` claims a review for `reviewerId`.
- `in_review -> pending` releases it and must name the assigned reviewer.
- A decision may be saved from `pending` (unassigned review) or `in_review` (assigned review).
- `approved`, `rejected`, and `needs_changes` are terminal outcomes. A `needs_changes` decision
  requires `correctedAnswer`; other outcomes reject that field.
- A single immutable decision is stored per review. Status and decision writes share one SQLite
  transaction, and optimistic status checks reject concurrent updates.

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
- `GET /api/internal/reviews/:id` returns the review, linked question log, and optional decision.
- `POST /api/internal/reviews/:id/status` claims or releases with `{ "status", "reviewerId" }`.
- `POST /api/internal/reviews/:id/decision` saves `{ "outcome", "reviewerId",
  "internalNotes"?, "correctedAnswer"? }`.

All request bodies reject unknown fields. IDs, enum values, pagination, string lengths, transition
rules, assignment ownership, and decision/correction consistency are validated on the server.

## Migration and rollback

Feature-specific versions are recorded in `review_schema_migrations`, avoiding interference with
other SQLite features. Each forward-only migration uses `BEGIN IMMEDIATE` and rolls back fully on
failure. Migration 1 adds `review_items`, `review_decisions`, foreign/unique constraints, checks, and
queue indexes; it does not rewrite `question_logs`. Operational rollback is to stop the application,
back up the database, and drop these two tables plus the `teacher_reviews` migration rows only if all
review data is intentionally being discarded.
