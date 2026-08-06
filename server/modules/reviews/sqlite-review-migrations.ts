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
  `
    ALTER TABLE review_decisions RENAME TO review_decisions_v1;

    CREATE TABLE review_decisions (
      id TEXT PRIMARY KEY,
      review_item_id TEXT NOT NULL UNIQUE
        REFERENCES review_items(id) ON DELETE RESTRICT,
      outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'rejected', 'needs_changes')),
      reviewer_id TEXT NOT NULL,
      internal_notes TEXT,
      corrected_answer TEXT,
      created_at TEXT NOT NULL,
      CHECK (outcome = 'approved' OR corrected_answer IS NULL),
      CHECK (corrected_answer IS NULL OR length(trim(corrected_answer)) > 0),
      CHECK (
        outcome <> 'needs_changes'
        OR (internal_notes IS NOT NULL AND length(trim(internal_notes)) > 0)
      )
    ) STRICT;

    INSERT INTO review_decisions (
      id, review_item_id, outcome, reviewer_id, internal_notes, corrected_answer, created_at
    )
    SELECT id, review_item_id,
      CASE WHEN outcome = 'needs_changes' THEN 'approved' ELSE outcome END,
      reviewer_id, internal_notes, corrected_answer, created_at
    FROM review_decisions_v1;

    UPDATE review_items SET status = 'approved' WHERE status = 'needs_changes';
    DROP TABLE review_decisions_v1;

    CREATE TABLE review_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      review_item_id TEXT NOT NULL REFERENCES review_items(id) ON DELETE RESTRICT,
      event_type TEXT NOT NULL CHECK (
        event_type IN ('created', 'status_changed', 'claimed', 'released', 'decision_saved')
      ),
      from_status TEXT CHECK (
        from_status IS NULL
        OR from_status IN ('pending', 'in_review', 'approved', 'rejected', 'needs_changes')
      ),
      to_status TEXT NOT NULL CHECK (
        to_status IN ('pending', 'in_review', 'approved', 'rejected', 'needs_changes')
      ),
      reviewer_id TEXT,
      decision_id TEXT REFERENCES review_decisions(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      CHECK (
        (event_type = 'created' AND from_status IS NULL
          AND to_status = 'pending' AND reviewer_id IS NULL AND decision_id IS NULL)
        OR (event_type = 'claimed' AND from_status = 'pending' AND to_status = 'in_review'
          AND reviewer_id IS NOT NULL AND decision_id IS NULL)
        OR (event_type = 'released' AND from_status = 'in_review' AND to_status = 'pending'
          AND reviewer_id IS NOT NULL AND decision_id IS NULL)
        OR (event_type = 'status_changed'
          AND from_status IS NOT NULL AND reviewer_id IS NOT NULL AND decision_id IS NULL)
        OR (event_type = 'decision_saved' AND from_status IN ('pending', 'in_review')
          AND to_status IN ('approved', 'rejected', 'needs_changes')
          AND reviewer_id IS NOT NULL AND decision_id IS NOT NULL)
      )
    ) STRICT;

    CREATE INDEX review_events_item_sequence_idx
      ON review_events (review_item_id, sequence);

    INSERT INTO review_events (
      id, review_item_id, event_type, from_status, to_status,
      reviewer_id, decision_id, created_at
    )
    SELECT 'migration:created:' || id, id, 'created', NULL, 'pending', NULL, NULL, created_at
    FROM review_items;

    INSERT INTO review_events (
      id, review_item_id, event_type, from_status, to_status,
      reviewer_id, decision_id, created_at
    )
    SELECT 'migration:claimed:' || id, id, 'claimed', 'pending', 'in_review',
      assigned_reviewer_id, NULL, claimed_at
    FROM review_items WHERE claimed_at IS NOT NULL;

    INSERT INTO review_events (
      id, review_item_id, event_type, from_status, to_status,
      reviewer_id, decision_id, created_at
    )
    SELECT 'migration:decision:' || r.id, r.id, 'decision_saved',
      CASE WHEN r.claimed_at IS NULL THEN 'pending' ELSE 'in_review' END,
      r.status, d.reviewer_id, d.id, d.created_at
    FROM review_items r JOIN review_decisions d ON d.review_item_id = r.id;

    CREATE TRIGGER review_events_no_update
    BEFORE UPDATE ON review_events BEGIN
      SELECT RAISE(ABORT, 'review events are append-only');
    END;
    CREATE TRIGGER review_events_no_delete
    BEFORE DELETE ON review_events BEGIN
      SELECT RAISE(ABORT, 'review events are append-only');
    END;
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
