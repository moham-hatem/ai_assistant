import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { type BackupMaintenanceConfig } from './maintenance-config.ts';
import { restoreConfirmation } from './maintenance-cli-input.ts';
import { runBackupMaintenance } from './maintenance-runner.ts';
import { RuntimeSafetyGuard } from './runtime-safety.ts';
import { LocalBackupService } from './service.ts';

test('restore maintenance previews first, blocks an active runtime, and validates the applied snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-maintenance-restore-'));
  const data = join(root, 'data');
  const backupDirectory = join(data, 'backups');
  const documents = join(data, 'documents');
  const knowledge = join(data, 'knowledge');
  const databasePath = join(data, 'books.sqlite');
  await Promise.all([
    mkdir(backupDirectory, { recursive: true }), mkdir(documents, { recursive: true }),
    mkdir(knowledge, { recursive: true }),
  ]);
  writeDatabase(databasePath, 'original');
  await writeFile(join(documents, 'book.txt'), 'original document');
  const config: BackupMaintenanceConfig = {
    backup: {
      appVersion: 'test', backupDirectory, dataDirectory: data,
      directoryScopes: [documents, knowledge], sqliteFiles: [databasePath],
    },
    databasePaths: [databasePath],
  };
  const creator = new LocalBackupService(config.backup);
  const backup = await creator.create(new Date('2026-08-10T12:00:00.000Z'));
  writeDatabase(databasePath, 'changed');
  await writeFile(join(documents, 'book.txt'), 'changed document');
  const output: Record<string, unknown>[] = [];
  const writer = { write: (value: Record<string, unknown>) => { output.push(value); } };
  try {
    await runBackupMaintenance({
      apply: false, backupId: backup.id, command: 'restore', confirmation: undefined,
    }, {
      config, output: writer,
      safety: new RuntimeSafetyGuard([databasePath], [5173], async () => true),
    });
    assert.equal(output[0]?.operation, 'restore-preview');
    assert.equal(readDatabase(databasePath), 'changed');

    await assert.rejects(runBackupMaintenance({
      apply: true, backupId: backup.id, command: 'restore',
      confirmation: restoreConfirmation(backup.id, backup.artifactSha256),
    }, {
      config, output: writer,
      safety: new RuntimeSafetyGuard([databasePath], [5173], async () => true),
    }), /runtime port is active/u);
    assert.equal(readDatabase(databasePath), 'changed');

    await runBackupMaintenance({
      apply: true, backupId: backup.id, command: 'restore',
      confirmation: restoreConfirmation(backup.id, backup.artifactSha256),
    }, {
      config, output: writer,
      safety: new RuntimeSafetyGuard([databasePath], [], async () => false),
    });
    assert.equal(readDatabase(databasePath), 'original');
    assert.equal(await readFile(join(documents, 'book.txt'), 'utf8'), 'original document');
    const completed = output.at(-1);
    assert.equal(completed?.operation, 'restore-complete');
    assert.equal(completed?.checkedDatabases, 1);
    assert.equal(completed?.checkedFiles, 2);
    await assert.rejects(readFile(join(backupDirectory, '.maintenance.lock')));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('restore maintenance requires the exact selected-backup confirmation before locking', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-maintenance-confirm-'));
  const data = join(root, 'data');
  const databasePath = join(data, 'books.sqlite');
  const backupDirectory = join(data, 'backups');
  await mkdir(backupDirectory, { recursive: true });
  writeDatabase(databasePath, 'safe');
  const config: BackupMaintenanceConfig = {
    backup: {
      appVersion: 'test', backupDirectory, dataDirectory: data,
      directoryScopes: [], sqliteFiles: [databasePath],
    }, databasePaths: [databasePath],
  };
  const backup = await new LocalBackupService(config.backup).create();
  try {
    await assert.rejects(runBackupMaintenance({
      apply: true, backupId: backup.id, command: 'restore', confirmation: 'RESTORE-WRONG',
    }, {
      config, output: { write: () => undefined },
      safety: new RuntimeSafetyGuard([databasePath], [], async () => false),
    }), /confirmation/u);
    await assert.rejects(readFile(join(backupDirectory, '.maintenance.lock')));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('retention preview is read-only while application requires a stopped runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-maintenance-retention-'));
  const data = join(root, 'data');
  const databasePath = join(data, 'books.sqlite');
  const backupDirectory = join(data, 'backups');
  await mkdir(backupDirectory, { recursive: true });
  writeDatabase(databasePath, 'safe');
  const config: BackupMaintenanceConfig = {
    backup: {
      appVersion: 'test', backupDirectory, dataDirectory: data,
      directoryScopes: [], sqliteFiles: [databasePath],
    }, databasePaths: [databasePath],
  };
  const service = new LocalBackupService(config.backup);
  await service.create(new Date('2026-08-01T00:00:00.000Z'));
  await service.create(new Date('2026-08-02T00:00:00.000Z'));
  const output: Record<string, unknown>[] = [];
  const activeSafety = new RuntimeSafetyGuard([databasePath], [5173], async () => true);
  try {
    await runBackupMaintenance({
      apply: false, command: 'retention', confirmation: undefined, keepCount: 1,
    }, { config, output: { write: (value) => { output.push(value); } }, safety: activeSafety });
    assert.equal((await service.list()).length, 2);
    const confirmation = String(output[0]?.confirmation);
    await assert.rejects(runBackupMaintenance({
      apply: true, command: 'retention', confirmation, keepCount: 1,
    }, { config, output: { write: () => undefined }, safety: activeSafety }), /runtime port is active/u);
    assert.equal((await service.list()).length, 2);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function writeDatabase(path: string, value: string): void {
  const database = new DatabaseSync(path);
  database.exec('DROP TABLE IF EXISTS records; CREATE TABLE records (value TEXT NOT NULL);');
  database.prepare('INSERT INTO records VALUES (?)').run(value);
  database.close();
}

function readDatabase(path: string): string {
  const database = new DatabaseSync(path, { readOnly: true });
  try { return (database.prepare('SELECT value FROM records').get() as { value: string }).value; }
  finally { database.close(); }
}
