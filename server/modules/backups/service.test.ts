import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { LOCAL_BACKUP_FILE_EXTENSION, LOCAL_BACKUP_FORMAT, LOCAL_BACKUP_FORMAT_VERSION } from '../../../shared/contracts/backups.ts';
import { createManifest, sha256, writeBackupArtifact } from './archive-codec.ts';
import { restoreAtomically } from './atomic-restore.ts';
import { LocalBackupService } from './service.ts';

const compress = promisify(gzip);
const decompress = promisify(gunzip);

test('creates, lists, validates, and restores a complete local snapshot', async () => {
  await withFixture(async ({ data, database, documents, knowledge, service, lifecycle }) => {
    createDatabase(database, 'original database value');
    await writeFile(join(documents, 'book.txt'), 'original document');
    await writeFile(join(knowledge, 'index.json'), '{"version":1}');
    await writeFile(join(documents, '.env.local'), 'OPENCODE_API_KEY=must-not-leak');
    await writeFile(join(documents, 'private.pem'), 'must-not-leak');

    const created = await service.create(new Date('2026-08-10T12:00:00.000Z'));
    assert.equal(created.fileCount, 3);
    assert.equal(created.createdAt, '2026-08-10T12:00:00.000Z');
    assert.match(created.artifactSha256, /^[0-9a-f]{64}$/u);
    assert.equal((await service.list())[0]?.id, created.id);
    assert.deepEqual(await service.validate(created.id, new Date('2026-08-10T12:01:00.000Z')), {
      checkedAt: '2026-08-10T12:01:00.000Z',
      fileCount: 3,
      id: created.id,
      status: 'valid',
      totalBytes: created.totalBytes,
    });

    createDatabase(database, 'changed database value');
    await writeFile(join(documents, 'book.txt'), 'changed document');
    await writeFile(join(documents, 'stale.txt'), 'must disappear');
    await writeFile(join(knowledge, 'index.json'), '{"version":2}');

    const result = await service.restore(created.id, new Date('2026-08-10T12:02:00.000Z'));
    assert.equal(result.restoredFiles, 3);
    assert.deepEqual(lifecycle, ['before', 'after:true']);
    assert.equal(readDatabase(database), 'original database value');
    assert.equal(await readFile(join(documents, 'book.txt'), 'utf8'), 'original document');
    assert.equal(await readFile(join(knowledge, 'index.json'), 'utf8'), '{"version":1}');
    await assert.rejects(readFile(join(documents, 'stale.txt')));
    await assert.rejects(readFile(join(documents, '.env.local')));
    await assert.rejects(readFile(join(documents, 'private.pem')));
    assert.equal((await readFile(join(data, 'backups', `${created.id}${LOCAL_BACKUP_FILE_EXTENSION}`))).length > 0, true);
  });
});

test('SQLite snapshot includes committed WAL data without copying WAL sidecars', async () => {
  await withFixture(async ({ database, service }) => {
    const source = new DatabaseSync(database);
    source.exec('PRAGMA journal_mode=WAL; CREATE TABLE records (value TEXT NOT NULL);');
    source.prepare('INSERT INTO records (value) VALUES (?)').run('committed in WAL');
    const created = await service.create();
    source.close();

    createDatabase(database, 'replacement');
    await service.restore(created.id);
    assert.equal(readDatabase(database), 'committed in WAL');
    assert.equal(created.fileCount, 1);
  });
});

test('detects tampering before restore and leaves live data unchanged', async () => {
  await withFixture(async ({ database, service }) => {
    createDatabase(database, 'safe value');
    const created = await service.create();
    const download = await service.download(created.id);
    const envelope = JSON.parse((await decompress(await readFile(download.path))).toString('utf8')) as {
      payload: Record<string, string>;
    };
    envelope.payload['books.sqlite'] = Buffer.from('tampered').toString('base64');
    await writeFile(download.path, await compress(Buffer.from(JSON.stringify(envelope))));

    await assert.rejects(service.restore(created.id), /checksum validation failed/u);
    assert.equal(readDatabase(database), 'safe value');
  });
});

test('rejects path traversal artifacts before writing outside data', async () => {
  await withFixture(async ({ data, service }) => {
    const id = crypto.randomUUID();
    const contents = Buffer.from('escape attempt');
    const entry = { kind: 'file' as const, path: '../escaped.txt', sha256: sha256(contents), size: contents.length };
    const manifest = createManifest({
      appVersion: 'test', createdAt: new Date().toISOString(), fileCount: 1,
      files: [entry], format: LOCAL_BACKUP_FORMAT, formatVersion: LOCAL_BACKUP_FORMAT_VERSION,
      id, scopes: ['../escaped.txt'], totalBytes: contents.length,
    });
    await writeBackupArtifact(
      join(data, 'backups', `${id}${LOCAL_BACKUP_FILE_EXTENSION}`),
      manifest,
      new Map([[entry.path, contents]]),
    );
    await assert.rejects(service.restore(id), /unsafe path/u);
    await assert.rejects(readFile(join(data, '..', 'escaped.txt')));
  });
});

test('atomic restore rolls back already installed scopes when a later swap fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-backup-rollback-'));
  const data = join(root, 'data');
  const work = join(data, 'backups', '.restore-test');
  await mkdir(join(data, 'first'), { recursive: true });
  await mkdir(work, { recursive: true });
  await writeFile(join(data, 'first', 'value.txt'), 'live original');
  await writeFile(join(data, 'blocked'), 'blocks creation of a nested target');
  const first = Buffer.from('backup first');
  const second = Buffer.from('backup second');
  const files = [
    { kind: 'file' as const, path: 'first/value.txt', sha256: sha256(first), size: first.length },
    { kind: 'file' as const, path: 'blocked/second.txt', sha256: sha256(second), size: second.length },
  ];
  const manifest = createManifest({
    appVersion: 'test', createdAt: new Date().toISOString(), fileCount: files.length,
    files, format: LOCAL_BACKUP_FORMAT, formatVersion: LOCAL_BACKUP_FORMAT_VERSION,
    id: crypto.randomUUID(), scopes: ['first', 'blocked/second.txt'],
    totalBytes: first.length + second.length,
  });
  const lifecycle: string[] = [];
  try {
    await assert.rejects(restoreAtomically(data, work, {
      manifest,
      payload: new Map([['first/value.txt', first], ['blocked/second.txt', second]]),
    }, {
      afterRestore: (success) => { lifecycle.push(`after:${success}`); },
      beforeRestore: () => { lifecycle.push('before'); },
    }));
    assert.equal(await readFile(join(data, 'first', 'value.txt'), 'utf8'), 'live original');
    assert.equal(await readFile(join(data, 'blocked'), 'utf8'), 'blocks creation of a nested target');
    assert.deepEqual(lifecycle, ['before', 'after:false']);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('service refuses live restore when no shutdown/restart coordinator is configured', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-backup-no-coordinator-'));
  const data = join(root, 'data');
  const database = join(data, 'books.sqlite');
  await mkdir(join(data, 'backups'), { recursive: true });
  createDatabase(database, 'must remain live');
  const service = new LocalBackupService({
    appVersion: 'test', backupDirectory: join(data, 'backups'), dataDirectory: data,
    directoryScopes: [], sqliteFiles: [database],
  });
  try {
    const backup = await service.create();
    await assert.rejects(
      service.restore(backup.id),
      /disabled until an explicit runtime shutdown and restart coordinator/u,
    );
    assert.equal(readDatabase(database), 'must remain live');
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

interface Fixture {
  data: string;
  database: string;
  documents: string;
  knowledge: string;
  lifecycle: string[];
  service: LocalBackupService;
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'ila-backup-'));
  const data = join(root, 'data');
  const documents = join(data, 'documents');
  const knowledge = join(data, 'knowledge');
  const database = join(data, 'books.sqlite');
  const lifecycle: string[] = [];
  await Promise.all([
    mkdir(documents, { recursive: true }),
    mkdir(knowledge, { recursive: true }),
    mkdir(join(data, 'backups'), { recursive: true }),
  ]);
  const service = new LocalBackupService({
    appVersion: '0.1.0-test', backupDirectory: join(data, 'backups'), dataDirectory: data,
    directoryScopes: [documents, knowledge], sqliteFiles: [database],
    restoreCoordinator: {
      afterRestore: (success) => { lifecycle.push(`after:${success}`); },
      beforeRestore: () => { lifecycle.push('before'); },
    },
  });
  try {
    await run({ data, database, documents, knowledge, lifecycle, service });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

function createDatabase(path: string, value: string): void {
  rmSyncDatabase(path);
  const database = new DatabaseSync(path);
  database.exec('CREATE TABLE records (value TEXT NOT NULL);');
  database.prepare('INSERT INTO records (value) VALUES (?)').run(value);
  database.close();
}

function readDatabase(path: string): string {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return (database.prepare('SELECT value FROM records LIMIT 1').get() as { value: string }).value;
  } finally {
    database.close();
  }
}

function rmSyncDatabase(path: string): void {
  const cleanup = new DatabaseSync(path);
  cleanup.close();
  const database = new DatabaseSync(path);
  database.exec('DROP TABLE IF EXISTS records;');
  database.close();
}
