import type { DatabaseSync } from 'node:sqlite';

const feature = 'teacher_reviews';
const migrations = [
  `
    CREATE TABLE review_items (
      id TEXT PRIMARY KEY,
      question_log_id TEXT NOT NULL UNIQUE
        REFERENCES question_logs(id) ON DELETE RESTRICT,
      status TEXT NOT NULL CHECK (
        status IN ('pending', 'in_review', 'approved', 'rejected', 'needs_changes')
      ),
      assigned_reviewer_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      claimed_at TEXT,
      decided_at TEXT
    ) STRICT;

    CREATE TABLE review_decisions (
      id TEXT PRIMARY KEY,
      review_item_id TEXT NOT NULL UNIQUE
        REFERENCES review_items(id) ON DELETE RESTRICT,
      outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'rejected', 'needs_changes')),
      reviewer_id TEXT NOT NULL,
      internal_notes TEXT,
      corrected_answer TEXT,
      created_at TEXT NOT NULL,
      CHECK (
        (outcome = 'needs_changes' AND corrected_answer IS NOT NULL)
        OR (outcome IN ('approved', 'rejected') AND corrected_answer IS NULL)
      )
    ) STRICT;

    CREATE INDEX review_items_queue_idx
      ON review_items (status, created_at DESC, id DESC);
    CREATE INDEX review_items_reviewer_idx
      ON review_items (assigned_reviewer_id, created_at DESC, id DESC);
  `,
] as const;

export function migrateReviewDatabase(database: DatabaseSync): void {
  const questionLogs = database.prepare(`
    SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'question_logs'
  `).get() as unknown as { present: number } | undefined;
  if (!questionLogs) throw new Error('Review storage requires the question_logs table.');

  database.exec(`
    CREATE TABLE IF NOT EXISTS review_schema_migrations (
      feature TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      applied_at TEXT NOT NULL,
      PRIMARY KEY (feature, version)
    ) STRICT;
  `);
  const rows = database.prepare(`
    SELECT version FROM review_schema_migrations WHERE feature = ? ORDER BY version
  `).all(feature) as unknown as Array<{ version: number }>;
  const versions = rows.map((row) => row.version);
  if (versions.some((version, index) => version !== index + 1)) {
    throw new Error('Review database migration history is incomplete or unsupported.');
  }
  if (versions.length > migrations.length) {
    throw new Error(`Review database schema version ${versions.length} is newer than supported.`);
  }

  for (let index = versions.length; index < migrations.length; index += 1) {
    database.exec('BEGIN IMMEDIATE;');
    try {
      database.exec(migrations[index]);
      database.prepare(`
        INSERT INTO review_schema_migrations (feature, version, applied_at)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      `).run(feature, index + 1);
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
  }
}
