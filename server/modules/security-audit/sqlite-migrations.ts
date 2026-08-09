import type { DatabaseSync } from 'node:sqlite';

export function migrateSecurityAuditDatabase(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS security_audit_schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version > 0), applied_at TEXT NOT NULL
    ) STRICT;
  `);
  const version = database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM security_audit_schema_migrations').get() as unknown as { version: number };
  if (version.version > 1) throw new Error('Security audit database schema is newer than supported.');
  if (version.version === 1) return;
  database.exec('BEGIN IMMEDIATE;');
  try {
    database.exec(`
      CREATE TABLE security_audit_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        timestamp TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('authentication','authorization','books','documents','reviews')),
        action TEXT NOT NULL CHECK (action IN (
          'auth.login','auth.logout','auth.session_revoked','authorization.denied',
          'book.edition_status_changed','book.edition_published','book.edition_restored',
          'document.ocr_approved','review.status_changed','review.decision_recorded'
        )),
        outcome TEXT NOT NULL CHECK (outcome IN ('success','denied','failure')),
        actor_user_id TEXT,
        subject_type TEXT CHECK (subject_type IS NULL OR subject_type IN ('user','session','book_edition','document','review_item')),
        subject_id TEXT,
        request_id TEXT NOT NULL,
        metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
        previous_hash TEXT NOT NULL CHECK (length(previous_hash) = 64),
        event_hash TEXT NOT NULL UNIQUE CHECK (length(event_hash) = 64),
        key_version TEXT NOT NULL,
        CHECK ((subject_type IS NULL) = (subject_id IS NULL))
      ) STRICT;
      CREATE INDEX security_audit_time_idx ON security_audit_events(timestamp DESC, sequence DESC);
      CREATE INDEX security_audit_filter_idx ON security_audit_events(category, action, outcome, timestamp DESC);
      CREATE INDEX security_audit_actor_idx ON security_audit_events(actor_user_id, timestamp DESC);
      CREATE TRIGGER security_audit_no_update BEFORE UPDATE ON security_audit_events BEGIN
        SELECT RAISE(ABORT, 'security audit events are append-only');
      END;
      CREATE TRIGGER security_audit_no_delete BEFORE DELETE ON security_audit_events BEGIN
        SELECT RAISE(ABORT, 'security audit events are append-only');
      END;
    `);
    database.prepare("INSERT INTO security_audit_schema_migrations VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}
