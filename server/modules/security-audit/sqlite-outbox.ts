import type { DatabaseSync } from 'node:sqlite';
import type { SecurityAuditCommand } from './domain.ts';
import { validateSecurityAuditCommand } from './domain.ts';
import type { SecurityAuditSink } from './repository.ts';

export function migrateSecurityAuditOutbox(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS security_audit_outbox (
      event_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS security_audit_outbox_created_idx
      ON security_audit_outbox(created_at, event_id);
    CREATE TRIGGER IF NOT EXISTS security_audit_outbox_no_update
      BEFORE UPDATE ON security_audit_outbox BEGIN
        SELECT RAISE(ABORT, 'security audit outbox entries cannot be changed');
      END;
  `);
}

export function enqueueSecurityAudit(database: DatabaseSync, command: SecurityAuditCommand): void {
  const safe = validateSecurityAuditCommand(command);
  database.prepare(`
    INSERT INTO security_audit_outbox(event_id, payload_json, created_at) VALUES (?, ?, ?)
  `).run(safe.id, JSON.stringify(safe), safe.timestamp);
}

export async function flushSecurityAuditOutbox(
  database: DatabaseSync,
  sink: SecurityAuditSink,
  limit = 100,
): Promise<number> {
  let delivered = 0;
  while (true) {
    const rows = database.prepare(`
      SELECT event_id, payload_json FROM security_audit_outbox
      ORDER BY created_at, event_id LIMIT ?
    `).all(limit) as unknown as Array<{ event_id: string; payload_json: string }>;
    for (const row of rows) {
      const command = validateSecurityAuditCommand(JSON.parse(row.payload_json) as SecurityAuditCommand);
      await sink.record(command);
      database.prepare('DELETE FROM security_audit_outbox WHERE event_id = ?').run(row.event_id);
      delivered += 1;
    }
    if (rows.length < limit) return delivered;
  }
}
