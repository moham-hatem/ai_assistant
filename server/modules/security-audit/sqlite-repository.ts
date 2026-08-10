import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  SecurityAuditEvent,
  SecurityAuditIntegritySummary,
  SecurityAuditPage,
} from '../../../shared/contracts/security-audit.ts';
import { canonicalAuditPayload, validateSecurityAuditCommand, type SecurityAuditCommand } from './domain.ts';
import type { SecurityAuditQuery, SecurityAuditRepository } from './repository.ts';
import {
  migrateSecurityAuditDatabase,
  validateSecurityAuditMigrationHistory,
} from './sqlite-migrations.ts';

const genesisHash = '0'.repeat(64);

interface AuditRow {
  action: SecurityAuditEvent['action'];
  actor_user_id: string | null;
  category: SecurityAuditEvent['category'];
  event_hash: string;
  id: string;
  key_version: string;
  metadata_json: string;
  outcome: SecurityAuditEvent['outcome'];
  previous_hash: string;
  request_id: string;
  sequence: number;
  subject_id: string | null;
  subject_type: SecurityAuditEvent['subjectType'];
  timestamp: string;
}

interface HeadRow {
  event_count: number;
  head_seal: string;
  key_version: string;
  last_event_hash: string;
  last_sequence: number;
}

export class SqliteSecurityAuditRepository implements SecurityAuditRepository {
  private readonly database: DatabaseSync;
  private readonly keys: ReadonlyMap<string, Buffer>;
  private readonly currentKeyVersion: string;

  constructor(path: string, keys: ReadonlyMap<string, Buffer>, currentKeyVersion: string) {
    if (!keys.has(currentKeyVersion)) throw new Error('Current security audit HMAC key is unavailable.');
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    if (path !== ':memory:' && existsSync(path)) validateExistingDatabase(path);
    this.keys = keys;
    this.currentKeyVersion = currentKeyVersion;
    this.database = new DatabaseSync(path);
    try {
      this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
      if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
      migrateSecurityAuditDatabase(this.database, {
        keyVersion: currentKeyVersion,
        seal: (count, sequence, hash) => headSeal(keys.get(currentKeyVersion)!, count, sequence, hash, currentKeyVersion),
        validateHistory: (database) => validateMigrationHistory(database, keys),
      });
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  async append(input: SecurityAuditCommand): Promise<void> {
    const command = validateSecurityAuditCommand(input);
    transaction(this.database, () => {
      const head = requireValidHead(this.database, this.keys);
      const existing = this.database.prepare(
        'SELECT * FROM security_audit_events WHERE id = ?',
      ).get(command.id) as unknown as AuditRow | undefined;
      if (existing) {
        const existingKey = this.keys.get(existing.key_version);
        const expectedHash = existingKey
          ? digest(existingKey, canonicalAuditPayload(
            rowCommand(existing), existing.previous_hash, existing.key_version,
          ))
          : undefined;
        if (sameCommand(existing, command) && expectedHash
            && equalHash(existing.event_hash, expectedHash)) return;
        throw new Error('Audit event id was reused with a different payload.');
      }
      const previousHash = head.last_event_hash;
      const key = this.keys.get(this.currentKeyVersion);
      if (!key) throw new Error('Current security audit HMAC key is unavailable.');
      const eventHash = digest(key, canonicalAuditPayload(command, previousHash, this.currentKeyVersion));
      const inserted = this.database.prepare(`
        INSERT INTO security_audit_events (
          id, timestamp, category, action, outcome, actor_user_id, subject_type,
          subject_id, request_id, metadata_json, previous_hash, event_hash, key_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        command.id, command.timestamp, command.category, command.action, command.outcome,
        command.actorUserId, command.subjectType, command.subjectId, command.requestId,
        JSON.stringify(command.metadata ?? {}), previousHash, eventHash, this.currentKeyVersion,
      );
      const sequence = Number(inserted.lastInsertRowid);
      this.database.prepare(`
        UPDATE security_audit_head SET
          event_count = ?, last_sequence = ?, last_event_hash = ?,
          key_version = ?, head_seal = ? WHERE singleton = 1
      `).run(
        head.event_count + 1,
        sequence,
        eventHash,
        this.currentKeyVersion,
        headSeal(key, head.event_count + 1, sequence, eventHash, this.currentKeyVersion),
      );
    });
  }

  async list(query: SecurityAuditQuery): Promise<SecurityAuditPage> {
    const clauses: string[] = [];
    const values: Array<number | string> = [];
    for (const [column, value] of [
      ['category', query.category], ['action', query.action], ['outcome', query.outcome],
      ['actor_user_id', query.actorUserId], ['subject_type', query.subjectType],
      ['subject_id', query.subjectId], ['request_id', query.requestId],
    ] as const) {
      if (value !== undefined) { clauses.push(`${column} = ?`); values.push(value); }
    }
    if (query.from) { clauses.push('timestamp >= ?'); values.push(query.from); }
    if (query.to) { clauses.push('timestamp <= ?'); values.push(query.to); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.database.prepare(`
      SELECT * FROM security_audit_events ${where}
      ORDER BY sequence DESC LIMIT ? OFFSET ?
    `).all(...values, query.limit, query.offset) as unknown as AuditRow[];
    const count = this.database.prepare(`SELECT COUNT(*) AS total FROM security_audit_events ${where}`)
      .get(...values) as unknown as { total: number };
    return { items: rows.map(toEvent), limit: query.limit, offset: query.offset, total: count.total };
  }

  async verifyIntegrity(checkedAt: string): Promise<SecurityAuditIntegritySummary> {
    const rows = this.database.prepare('SELECT * FROM security_audit_events ORDER BY sequence').all() as unknown as AuditRow[];
    const head = this.database.prepare('SELECT * FROM security_audit_head WHERE singleton = 1').get() as unknown as HeadRow | undefined;
    let previousHash = genesisHash;
    const versions = new Set<string>();
    let firstInvalidSequence: number | null = null;
    let missingKey = false;
    let checkedEvents = 0;
    let headStatus: 'invalid' | 'unverifiable' | 'valid' = 'invalid';
    if (head) {
      versions.add(head.key_version);
      const key = this.keys.get(head.key_version);
      if (!key) {
        missingKey = true;
        headStatus = 'unverifiable';
      } else {
        const expected = headSeal(
          key, head.event_count, head.last_sequence, head.last_event_hash, head.key_version,
        );
        headStatus = equalHash(head.head_seal, expected) ? 'valid' : 'invalid';
      }
    }
    for (const row of rows) {
      versions.add(row.key_version);
      const key = this.keys.get(row.key_version);
      if (!key) { missingKey = true; firstInvalidSequence ??= row.sequence; break; }
      let expected: string;
      try {
        expected = digest(key, canonicalAuditPayload(rowCommand(row), previousHash, row.key_version));
      } catch {
        firstInvalidSequence = row.sequence;
        break;
      }
      if (row.previous_hash !== previousHash || !equalHash(row.event_hash, expected)) {
        firstInvalidSequence = row.sequence;
        break;
      }
      previousHash = row.event_hash;
      checkedEvents += 1;
    }
    const tail = rows.at(-1);
    const headMatchesRows = head !== undefined
      && head.event_count === rows.length
      && head.last_sequence === (tail?.sequence ?? 0)
      && head.last_event_hash === (tail?.event_hash ?? genesisHash);
    const status = missingKey || headStatus === 'unverifiable' ? 'unverifiable'
      : firstInvalidSequence === null && headStatus === 'valid' && headMatchesRows
        ? 'valid' : 'invalid';
    return {
      assurance: 'local_authenticated_head',
      checkedAt,
      checkedEvents,
      externallyAnchored: false,
      firstInvalidSequence,
      keyVersions: [...versions].sort(),
      status,
      totalEvents: rows.length,
    };
  }

  close(): void { this.database.close(); }
}

function requireValidHead(database: DatabaseSync, keys: ReadonlyMap<string, Buffer>): HeadRow {
  const head = database.prepare('SELECT * FROM security_audit_head WHERE singleton = 1').get() as unknown as HeadRow | undefined;
  if (!head) throw new Error('Security audit authenticated head is missing.');
  const key = keys.get(head.key_version);
  if (!key || !equalHash(
    head.head_seal,
    headSeal(key, head.event_count, head.last_sequence, head.last_event_hash, head.key_version),
  )) throw new Error('Security audit authenticated head is invalid.');
  const tail = database.prepare(`
    SELECT COUNT(*) AS event_count, COALESCE(MAX(sequence), 0) AS last_sequence
    FROM security_audit_events
  `).get() as unknown as { event_count: number; last_sequence: number };
  const last = database.prepare(`
    SELECT event_hash FROM security_audit_events ORDER BY sequence DESC LIMIT 1
  `).get() as unknown as { event_hash: string } | undefined;
  if (tail.event_count !== head.event_count || tail.last_sequence !== head.last_sequence
      || (last?.event_hash ?? genesisHash) !== head.last_event_hash) {
    throw new Error('Security audit events do not match the authenticated head.');
  }
  return head;
}

function validateHistoricalChain(
  database: DatabaseSync,
  keys: ReadonlyMap<string, Buffer>,
): void {
  const rows = database.prepare(
    'SELECT * FROM security_audit_events ORDER BY sequence',
  ).all() as unknown as AuditRow[];
  let previousHash = genesisHash;
  for (const row of rows) {
    const key = keys.get(row.key_version);
    if (!key) throw new Error(`Security audit historical key is unavailable: ${row.key_version}.`);
    const expected = digest(
      key,
      canonicalAuditPayload(rowCommand(row), previousHash, row.key_version),
    );
    if (row.previous_hash !== previousHash || !equalHash(row.event_hash, expected)) {
      throw new Error(`Security audit history is invalid at sequence ${row.sequence}.`);
    }
    previousHash = row.event_hash;
  }
}

function validateExistingDatabase(path: string): void {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    validateSecurityAuditMigrationHistory(database);
  } finally {
    database.close();
  }
}

function validateMigrationHistory(
  database: DatabaseSync,
  keys: ReadonlyMap<string, Buffer>,
): void {
  validateHistoricalChain(database, keys);
  const headExists = database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'security_audit_head'
  `).get();
  if (headExists) requireValidHead(database, keys);
}

function headSeal(
  key: Buffer,
  eventCount: number,
  lastSequence: number,
  lastEventHash: string,
  keyVersion: string,
): string {
  return digest(key, JSON.stringify([
    'security-audit-local-head-v1', eventCount, lastSequence, lastEventHash, keyVersion,
  ]));
}

function digest(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload, 'utf8').digest('hex');
}

function equalHash(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/u.test(left) || !/^[0-9a-f]{64}$/u.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function rowCommand(row: AuditRow): SecurityAuditCommand {
  return {
    action: row.action,
    actorUserId: row.actor_user_id,
    category: row.category,
    id: row.id,
    metadata: JSON.parse(row.metadata_json) as SecurityAuditCommand['metadata'],
    outcome: row.outcome,
    requestId: row.request_id,
    subjectId: row.subject_id,
    subjectType: row.subject_type,
    timestamp: row.timestamp,
  };
}

function sameCommand(row: AuditRow, command: SecurityAuditCommand): boolean {
  try {
    return canonicalAuditPayload(rowCommand(row), row.previous_hash, row.key_version)
      === canonicalAuditPayload(command, row.previous_hash, row.key_version);
  } catch { return false; }
}

function toEvent(row: AuditRow): SecurityAuditEvent {
  return {
    ...rowCommand(row),
    eventHash: row.event_hash,
    keyVersion: row.key_version,
    metadata: JSON.parse(row.metadata_json) as SecurityAuditEvent['metadata'],
    previousHash: row.previous_hash,
    sequence: row.sequence,
  };
}

function transaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE;');
  try { const result = operation(); database.exec('COMMIT;'); return result; }
  catch (error) { database.exec('ROLLBACK;'); throw error; }
}
