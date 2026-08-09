# Feedback backend contract

Feedback is local-only and stored in `data/question-log.sqlite`. It records a learner's assessment
of an immutable question-log result. It never edits an answer, approved answer, review decision,
book, or edition automatically. No authentication or personal identity is invented by this feature;
the existing internal endpoints remain suitable only for a trusted local operator.

## Public submission

`POST /api/feedback` accepts a JSON body no larger than 16,384 bytes:

```json
{
  "questionLogId": "UUID returned as requestId by /api/answer-question",
  "rating": "helpful | unhelpful",
  "reasons": [
    "inaccurate | unclear | wrong_language | irrelevant_evidence | technical_issue | harmful_or_sensitive"
  ],
  "comment": "optional, trimmed, at most 1000 characters",
  "submissionId": "client-generated UUID"
}
```

Unknown fields are rejected. `helpful` requires an empty reasons array. `unhelpful` requires at
least one reason. Reasons must be recognized and unique. Whitespace-only comments are treated as
omitted. Both identifiers must be UUIDs.

A successful first submission or exact replay returns HTTP 201:

```json
{
  "feedback": {},
  "review": { "created": false, "reviewId": null },
  "requestId": "UUID for this API call"
}
```

`review.created` is stable across exact replays: it states whether this feedback originally created
the linked review. It is `false` when no review was needed or when the question log already had a
review.

## Idempotency and readiness

`submissionId` is never stored raw. The server stores its SHA-256 digest under a unique constraint,
plus a digest of the normalized feedback payload. Repeating the same submission and payload returns
the original feedback and review link without new rows or events. Reusing the submission id for a
different normalized payload returns `409 FEEDBACK_CONFLICT`.

The answer handler waits for the isolated question-log write attempt before sending its successful
response. Therefore a `requestId` exposed by a completed answer is immediately eligible for feedback.
Question-log persistence failure still does not replace a valid answer, but feedback for a log that
could not be persisted correctly returns `404 QUESTION_LOG_NOT_FOUND`; it never reports false
success.

## Review escalation

- `helpful` never creates or links a review.
- `harmful_or_sensitive` creates a review for the current question log immediately.
- The third `unhelpful` rating for the same normalized question and answer language creates a review
  for the current question log. Later matching cases also qualify independently.
- If a review already exists for that question log, feedback links to it without creating another
  review or creation event.

Question normalization uses the same exact normalization as approved answers. Feedback stores only
the channel and answer-language snapshots required for stable filtering, plus a SHA-256 digest of
the normalized question for threshold counting. It does not copy the question, answer, evidence,
submission id, or user identity.

The feedback insert, threshold check, optional `review_items` insert, `review_events` creation, and
feedback-to-review link execute under one `BEGIN IMMEDIATE` transaction. Any failure rolls all of
them back.

## Internal reads

- `GET /api/internal/feedback` supports `limit` (1-100), `offset` (0-1,000,000), `rating`, `reason`,
  `language`, `channel`, and `reviewStatus` filters. `reviewStatus` accepts a review state or `none`.
  List rows expose `hasComment` but not comment text.
- `GET /api/internal/feedback/:id` returns the feedback record and its linked current review item, if
  any. The linked question log remains available through `/api/internal/question-logs/:questionLogId`.

Filters reject unknown or repeated query parameters. All success and error responses include a new
request id. Missing feedback returns `404 FEEDBACK_NOT_FOUND`; unavailable storage returns
`503 FEEDBACK_UNAVAILABLE`; unexpected persistence failures return a non-success API response.
Runtime failure logging includes only the request id and error class, not request bodies, comments,
questions, answers, or stack traces.

## Migration and rollback

Feature versions live in `feedback_schema_migrations`. Migration 1 creates `feedback_entries`, its
foreign keys to `question_logs` and `review_items`, digest uniqueness, checks, and filter indexes.
Each forward migration is transactional and records its version only after success.

Operational rollback is to stop the application and restore the pre-migration database backup.
Dropping `feedback_entries` and its migration rows is appropriate only when all feedback and its
review links are intentionally discarded; existing question logs, reviews, answers, and books are
not rewritten by the migration.
