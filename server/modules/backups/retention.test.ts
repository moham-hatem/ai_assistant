import assert from 'node:assert/strict';
import { lstat, mkdtemp, mkdir, readFile, readdir, rename, rm, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { applyRetentionPlan, createRetentionPlan } from './retention.ts';
import { LocalBackupService } from './service.ts';

test('retention is previewable, confirmation-bound, and preserves the newest valid backup', async () => {
  await withBackups(async ({ backupDirectory, service }) => {
    await service.create(new Date('2026-08-01T00:00:00.000Z'));
    await service.create(new Date('2026-08-02T00:00:00.000Z'));
    await service.create(new Date('2026-08-03T00:00:00.000Z'));
    const plan = createRetentionPlan(await service.list(), 1);
    assert.equal(plan.keep.length, 1);
    assert.equal(plan.delete.length, 2);
    assert.equal(plan.keep[0]?.createdAt, '2026-08-03T00:00:00.000Z');
    assert.match(plan.confirmation, /^DELETE-BACKUPS-[0-9A-F]{16}$/u);
    assert.equal((await artifactNames(backupDirectory)).length, 3);

    await assert.rejects(
      applyRetentionPlan(service, backupDirectory, plan, 'DELETE-BACKUPS-WRONG'),
      /confirmation/u,
    );
    assert.equal((await artifactNames(backupDirectory)).length, 3);
    assert.deepEqual(await applyRetentionPlan(service, backupDirectory, plan, plan.confirmation), plan.delete.map((item) => item.id));
    assert.deepEqual(await artifactNames(backupDirectory), [`${plan.keep[0]?.id}.ilabackup`]);
    assert.equal((await service.list()).length, 1);
  });
});

test('retention confirmation is bound to checksums for the complete keep and delete inventory', () => {
  const base = {
    appVersion: 'test', artifactBytes: 10, createdAt: '2026-08-01T00:00:00.000Z',
    fileCount: 1, formatVersion: 1, id: '11111111-1111-4111-8111-111111111111', totalBytes: 5,
  };
  const first = createRetentionPlan([{ ...base, artifactSha256: 'a'.repeat(64) }], 1);
  const changed = createRetentionPlan([{ ...base, artifactSha256: 'b'.repeat(64) }], 1);
  assert.notEqual(first.confirmation, changed.confirmation);
});

test('retention invalidates confirmation when inventory changes and never deletes the last backup', async () => {
  await withBackups(async ({ backupDirectory, service }) => {
    await service.create(new Date('2026-08-01T00:00:00.000Z'));
    const only = createRetentionPlan(await service.list(), 1);
    assert.equal(only.delete.length, 0);
    assert.deepEqual(await applyRetentionPlan(service, backupDirectory, only, undefined), []);

    await service.create(new Date('2026-08-02T00:00:00.000Z'));
    const stale = createRetentionPlan(await service.list(), 1);
    await service.create(new Date('2026-08-03T00:00:00.000Z'));
    await assert.rejects(
      applyRetentionPlan(service, backupDirectory, stale, stale.confirmation),
      /inventory changed/u,
    );
    assert.equal((await service.list()).length, 3);
  });
});

test('listing for default retention preview does not create missing backup storage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-retention-preview-'));
  const data = join(root, 'data');
  const backupDirectory = join(data, 'backups');
  await mkdir(data, { recursive: true });
  const service = new LocalBackupService({
    appVersion: 'test', backupDirectory, dataDirectory: data,
    directoryScopes: [], sqliteFiles: [join(data, 'books.sqlite')],
  });
  try {
    assert.deepEqual(await service.list(), []);
    await assert.rejects(lstat(backupDirectory), { code: 'ENOENT' });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('retention rolls every staged artifact back when a rename fails', async () => {
  await withBackups(async ({ backupDirectory, service }) => {
    await service.create(new Date('2026-08-01T00:00:00.000Z'));
    await service.create(new Date('2026-08-02T00:00:00.000Z'));
    await service.create(new Date('2026-08-03T00:00:00.000Z'));
    const plan = createRetentionPlan(await service.list(), 1);
    let renameCount = 0;
    await assert.rejects(
      applyRetentionPlan(service, backupDirectory, plan, plan.confirmation, {
        lstat,
        mkdir,
        readFile,
        rename: async (source, destination) => {
          renameCount += 1;
          if (renameCount === 2) throw new Error('injected staging failure');
          return rename(source, destination);
        },
        rmdir,
        unlink,
      }),
      /no backup was deleted/u,
    );
    assert.equal((await artifactNames(backupDirectory)).length, 3);
    assert.equal((await readdir(backupDirectory)).some((name) => name.startsWith('.retention-staging-')), false);
  });
});

test('retention reports a recoverable staging directory when final purge fails', async () => {
  await withBackups(async ({ backupDirectory, service }) => {
    await service.create(new Date('2026-08-01T00:00:00.000Z'));
    await service.create(new Date('2026-08-02T00:00:00.000Z'));
    await service.create(new Date('2026-08-03T00:00:00.000Z'));
    const plan = createRetentionPlan(await service.list(), 1);
    await assert.rejects(
      applyRetentionPlan(service, backupDirectory, plan, plan.confirmation, {
        lstat,
        mkdir,
        readFile,
        rename,
        rmdir,
        unlink: async () => { throw new Error('injected purge failure'); },
      }),
      /can be recovered from \.retention-staging-/u,
    );
    assert.deepEqual(await artifactNames(backupDirectory), [`${plan.keep[0]?.id}.ilabackup`]);
    const staging = (await readdir(backupDirectory)).find((name) => name.startsWith('.retention-staging-'));
    assert.ok(staging);
    assert.equal((await artifactNames(join(backupDirectory, staging))).length, 2);
  });
});

test('retention rolls staged files back when their confirmed checksum changed', async () => {
  await withBackups(async ({ backupDirectory, service }) => {
    await service.create(new Date('2026-08-01T00:00:00.000Z'));
    await service.create(new Date('2026-08-02T00:00:00.000Z'));
    const plan = createRetentionPlan(await service.list(), 1);
    await assert.rejects(applyRetentionPlan(service, backupDirectory, plan, plan.confirmation, {
      lstat,
      mkdir,
      readFile: async () => Buffer.from('replacement'),
      rename,
      rmdir,
      unlink,
    }), /no backup was deleted/u);
    assert.equal((await artifactNames(backupDirectory)).length, 2);
    assert.equal((await readdir(backupDirectory)).some((name) => name.startsWith('.retention-staging-')), false);
  });
});

async function withBackups(run: (value: {
  backupDirectory: string;
  service: LocalBackupService;
}) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'ila-retention-'));
  const data = join(root, 'data');
  const backupDirectory = join(data, 'backups');
  const databasePath = join(data, 'books.sqlite');
  await mkdir(backupDirectory, { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('CREATE TABLE records (value TEXT);');
  database.close();
  const service = new LocalBackupService({
    appVersion: 'test', backupDirectory, dataDirectory: data,
    directoryScopes: [], sqliteFiles: [databasePath],
  });
  try { await run({ backupDirectory, service }); }
  finally { await rm(root, { force: true, recursive: true }); }
}

async function artifactNames(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => name.endsWith('.ilabackup')).sort();
}
