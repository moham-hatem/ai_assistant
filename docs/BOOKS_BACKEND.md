# Local books backend

`server/modules/books` owns a replaceable repository contract and a local SQLite implementation.
Schema changes are ordered migrations tracked by `PRAGMA user_version`. Languages are stored as
validated open text and are not restricted to the languages currently exposed by the UI.

The internal API is rooted at `/api/internal/books` and supports:

- `POST /api/internal/books` and `GET /api/internal/books`
- `GET /api/internal/books/:bookId`
- `POST /api/internal/books/:bookId/editions` and
  `GET /api/internal/books/:bookId/editions`
- `POST /api/internal/books/:bookId/editions/:editionId/transition`
- `GET` and `POST /api/internal/books/:bookId/editions/:editionId/processing`
- `POST /api/internal/books/:bookId/editions/:editionId/processing/approve`

List endpoints use `limit` and `offset`; the default limit is 25 and the maximum is 100. This is a
local-development API, so it has request validation and stable error codes but intentionally has no
authentication yet.

Edition creation always starts in `draft` and does not publish content. Publishing is an explicit
transition from `ready`. In one SQLite transaction, the selected edition becomes `published` and
the previous published edition becomes `archived`. Content hashes are unique within a book and
remain reserved after archival so history is never silently replaced.

Rollback to an older edition is also explicit: transition that archived edition to `ready` first,
which clears its `archivedAt`, and then publish it in a separate transition. Direct publication from
`archived` is invalid. Republishing records a new `publishedAt` and atomically archives whichever
edition was active, while both edition records and their content hashes remain in history.

## Document integration boundary

`POST /api/knowledge/documents?bookId=...&version=...&name=...` attaches an uploaded document to
an existing book. It creates the edition as `draft`, extracts and stores the document while the
edition is `processing`. It returns `{ book, edition, document }` with a `ready` edition when enough
text was extracted, or preserves the edition in `processing` when its document is `ocr_required` or
`review_required`. Uploading never publishes a linked edition; publication remains an explicit
lifecycle transition. A duplicate content hash returns `DUPLICATE_EDITION`, while extraction failures
return `DOCUMENT_EXTRACTION_FAILED` without exposing extractor internals.

The processing endpoint reports the stored generation and summary and can start a new local attempt.
The approval endpoint passes the authenticated `principal.id` into the processing-service boundary
and changes a `review_required` document and its edition to `ready`; it never publishes the edition.
The current document schema does not persist an approval actor or audit event, so durable book-action
auditing remains future work. Published editions are immutable through these processing endpoints.
Poppler and Tesseract are optional external executables: when unavailable,
the original PDF remains stored with `ocr_required` so it can be retried after the tools are installed.

The compatibility upload without `bookId` remains available for legacy operators. It creates an
implicit `und` book and publishes that edition automatically, so the admin UI presents it in a
separate, clearly labelled section.

If the books database cannot initialize, the books API and linked upload return
`BOOKS_UNAVAILABLE`; the answer path continues to initialize independently.
