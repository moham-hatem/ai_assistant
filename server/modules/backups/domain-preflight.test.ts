import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { SqliteSecurityAuditRepository } from '../security-audit/sqlite-repository.ts';
import { sha256 } from './archive-codec.ts';
import { validateRestoredDomains, type BackupDomainPreflightConfig } from './domain-preflight.ts';

test('domain preflight rejects a future schema without modifying incoming restored bytes', async () => {
  await withIncoming(async ({ config, incoming }) => {
    const path = join(incoming, 'books.sqlite');
    const database = new DatabaseSync(path);
    database.exec('PRAGMA user_version = 999;');
    database.close();
    const before = sha256(await readFile(path));
    await assert.rejects(validateRestoredDomains(config, incoming), /newer than supported/u);
    assert.equal(sha256(await readFile(path)), before);
  });
});

test('domain preflight verifies the security audit HMAC chain using current configured keys on a copy', async () => {
  await withIncoming(async ({ config, incoming }) => {
    const path = join(incoming, 'security-audit.sqlite');
    const originalKey = Buffer.alloc(32, 1);
    const repository = new SqliteSecurityAuditRepository(path, new Map([['v1', originalKey]]), 'v1');
    repository.close();
    const before = sha256(await readFile(path));
    config.securityAudit = {
      config: { currentKeyVersion: 'v1', databasePath: path, keys: new Map([['v1', Buffer.alloc(32, 2)]]) },
    };
    await assert.rejects(validateRestoredDomains(config, incoming), /HMAC chain is not valid/u);
    assert.equal(sha256(await readFile(path)), before);
  });
});

async function withIncoming(run: (value: {
  config: BackupDomainPreflightConfig;
  incoming: string;
}) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'ila-domain-preflight-'));
  const data = join(root, 'data');
  const incoming = join(root, 'incoming');
  await Promise.all([mkdir(data), mkdir(incoming)]);
  const config: BackupDomainPreflightConfig = {
    authDatabasePath: join(data, 'auth.sqlite'),
    booksDatabasePath: join(data, 'books.sqlite'),
    dataDirectory: data,
    questionDatabasePath: join(data, 'question-log.sqlite'),
    securityAudit: { setupError: 'audit key missing' },
    securityAuditDatabasePath: join(data, 'security-audit.sqlite'),
    telegramDatabasePath: join(data, 'telegram.sqlite'),
  };
  try { await run({ config, incoming }); }
  finally { await rm(root, { force: true, recursive: true }); }
}
