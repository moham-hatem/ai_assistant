import type { DatabaseSync } from 'node:sqlite';

export interface SecurityAuditHeadInitializer {
  keyVersion: string;
  seal(eventCount: number, lastSequence: number, lastEventHash: string): string;
  validateHistory(database: DatabaseSync): void;
}

export function migrateSecurityAuditDatabase(
  database: DatabaseSync,
  head: SecurityAuditHeadInitializer,
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS security_audit_schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version > 0), applied_at TEXT NOT NULL
    ) STRICT;
  `);
  const version = database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM security_audit_schema_migrations').get() as unknown as { version: number };
  if (version.version > 2) throw new Error('Security audit database schema is newer than supported.');
  if (version.version < 1) transaction(database, () => {
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
  });
  if (version.version < 2) transaction(database, () => {
    head.validateHistory(database);
    database.exec(`
      CREATE TABLE security_audit_head (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        event_count INTEGER NOT NULL CHECK (event_count >= 0),
        last_sequence INTEGER NOT NULL CHECK (last_sequence >= 0),
        last_event_hash TEXT NOT NULL CHECK (length(last_event_hash) = 64),
        key_version TEXT NOT NULL,
        head_seal TEXT NOT NULL CHECK (length(head_seal) = 64)
      ) STRICT;
      CREATE TRIGGER security_audit_head_no_delete
      BEFORE DELETE ON security_audit_head BEGIN
        SELECT RAISE(ABORT, 'security audit head cannot be deleted');
      END;
    `);
    const tail = database.prepare(`
      SELECT sequence, event_hash FROM security_audit_events ORDER BY sequence DESC LIMIT 1
    `).get() as unknown as { event_hash: string; sequence: number } | undefined;
    const count = database.prepare('SELECT COUNT(*) AS count FROM security_audit_events').get() as unknown as { count: number };
    const lastSequence = tail?.sequence ?? 0;
    const lastEventHash = tail?.event_hash ?? '0'.repeat(64);
    database.prepare(`
      INSERT INTO security_audit_head (
        singleton, event_count, last_sequence, last_event_hash, key_version, head_seal
      ) VALUES (1, ?, ?, ?, ?, ?)
    `).run(
      count.count,
      lastSequence,
      lastEventHash,
      head.keyVersion,
      head.seal(count.count, lastSequence, lastEventHash),
    );
    database.prepare("INSERT INTO security_audit_schema_migrations VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
  });
}

function transaction(database: DatabaseSync, operation: () => void): void {
  database.exec('BEGIN IMMEDIATE;');
  try { operation(); database.exec('COMMIT;'); }
  catch (error) { database.exec('ROLLBACK;'); throw error; }
}
