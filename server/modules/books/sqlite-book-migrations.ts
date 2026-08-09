import type { DatabaseSync } from 'node:sqlite';

const migrations = [
  `
    CREATE TABLE books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author_organization TEXT,
      language TEXT NOT NULL,
      subject TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE book_editions (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
      version TEXT NOT NULL,
      original_document_reference TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('draft', 'processing', 'ready', 'published', 'rejected', 'archived')
      ),
      created_at TEXT NOT NULL,
      published_at TEXT,
      archived_at TEXT,
      UNIQUE (book_id, content_hash)
    ) STRICT;

    CREATE INDEX books_created_at_idx ON books (created_at DESC, id DESC);
    CREATE INDEX book_editions_book_created_at_idx
      ON book_editions (book_id, created_at DESC, id DESC);
    CREATE UNIQUE INDEX book_editions_one_published_idx
      ON book_editions (book_id) WHERE status = 'published';
  `,
  `
    CREATE TABLE book_ocr_approval_intents (
      edition_id TEXT PRIMARY KEY REFERENCES book_editions(id) ON DELETE RESTRICT,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
      document_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
  `,
] as const;

export function migrateBookDatabase(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get() as unknown as { user_version: number };
  if (row.user_version > migrations.length) {
    throw new Error(`Book database schema version ${row.user_version} is newer than supported.`);
  }

  for (let index = row.user_version; index < migrations.length; index += 1) {
    database.exec('BEGIN IMMEDIATE;');
    try {
      database.exec(migrations[index]);
      database.exec(`PRAGMA user_version = ${index + 1};`);
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
  }
}
