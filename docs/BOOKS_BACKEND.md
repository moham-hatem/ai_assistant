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

## Deliberate integration boundary

This registry is not connected to the existing document upload, extraction, or knowledge-search
paths. Creating or publishing an edition does not import a file, rebuild an index, change search
results, or publish content externally. That integration requires a separate reviewed milestone.

If the books database cannot initialize, the books API returns `BOOKS_UNAVAILABLE`; the existing
answer and document-upload paths continue to initialize independently.
