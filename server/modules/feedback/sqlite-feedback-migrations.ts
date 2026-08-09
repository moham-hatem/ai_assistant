import type { DatabaseSync } from 'node:sqlite';

const feature = 'feedback';
const migrations = [
  `
    CREATE TABLE feedback_entries (
      id TEXT PRIMARY KEY,
      question_log_id TEXT NOT NULL REFERENCES question_logs(id) ON DELETE RESTRICT,
      submission_digest TEXT NOT NULL UNIQUE CHECK (length(submission_digest) = 64),
      payload_digest TEXT NOT NULL CHECK (length(payload_digest) = 64),
      question_digest TEXT NOT NULL CHECK (length(question_digest) = 64),
      rating TEXT NOT NULL CHECK (rating IN ('helpful', 'unhelpful')),
      reasons TEXT NOT NULL CHECK (
        json_valid(reasons)
        AND json_type(reasons) = 'array'
        AND json_array_length(reasons) <= 6
      ),
      comment TEXT CHECK (
        comment IS NULL OR (length(comment) BETWEEN 1 AND 1000 AND comment = trim(comment))
      ),
      answer_language TEXT NOT NULL CHECK (length(trim(answer_language)) > 0),
      channel TEXT NOT NULL CHECK (length(trim(channel)) > 0),
      review_item_id TEXT REFERENCES review_items(id) ON DELETE RESTRICT,
      review_created INTEGER NOT NULL DEFAULT 0 CHECK (review_created IN (0, 1)),
      created_at TEXT NOT NULL,
      CHECK (
        (rating = 'helpful' AND json_array_length(reasons) = 0)
        OR (rating = 'unhelpful' AND json_array_length(reasons) > 0)
      ),
      CHECK (review_created = 0 OR review_item_id IS NOT NULL)
    ) STRICT;

    CREATE INDEX feedback_created_at_idx
      ON feedback_entries (created_at DESC, id DESC);
    CREATE INDEX feedback_rating_language_idx
      ON feedback_entries (rating, answer_language, question_digest);
    CREATE INDEX feedback_channel_idx
      ON feedback_entries (channel, created_at DESC, id DESC);
    CREATE INDEX feedback_review_idx
      ON feedback_entries (review_item_id);
  `,
] as const;

export function migrateFeedbackDatabase(database: DatabaseSync): void {
  for (const table of ['question_logs', 'review_items', 'review_events']) {
    const row = database.prepare(`
      SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?
    `).get(table) as unknown as { present: number } | undefined;
    if (!row) throw new Error(`Feedback storage requires the ${table} table.`);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS feedback_schema_migrations (
      feature TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      applied_at TEXT NOT NULL,
      PRIMARY KEY (feature, version)
    ) STRICT;
  `);
  const rows = database.prepare(`
    SELECT version FROM feedback_schema_migrations WHERE feature = ? ORDER BY version
  `).all(feature) as unknown as Array<{ version: number }>;
  const versions = rows.map((row) => row.version);
  if (versions.some((version, index) => version !== index + 1)) {
    throw new Error('Feedback database migration history is incomplete or unsupported.');
  }
  if (versions.length > migrations.length) {
    throw new Error(`Feedback database schema version ${versions.length} is newer than supported.`);
  }

  for (let index = versions.length; index < migrations.length; index += 1) {
    database.exec('BEGIN IMMEDIATE;');
    try {
      database.exec(migrations[index]);
      database.prepare(`
        INSERT INTO feedback_schema_migrations (feature, version, applied_at)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      `).run(feature, index + 1);
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
  }
}
