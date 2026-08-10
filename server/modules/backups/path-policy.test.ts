import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertNonOverlappingScopes, pathsOverlap, toArchivePath } from './path-policy.ts';
import { LocalBackupService } from './service.ts';

test('backup storage cannot overlap a source in either direction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-backup-overlap-'));
  const data = join(root, 'data');
  await mkdir(join(data, 'backups', 'documents'), { recursive: true });
  try {
    assert.throws(() => new LocalBackupService({
      appVersion: 'test', backupDirectory: join(data, 'backups'), dataDirectory: data,
      directoryScopes: [join(data, 'backups', 'documents')], sqliteFiles: [],
    }), /cannot (?:overlap|contain)/u);
    assert.equal(pathsOverlap(join(data, 'backups'), join(data, 'backups', 'documents')), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('scope uniqueness follows case-insensitive Windows filesystem semantics', () => {
  if (process.platform === 'win32') {
    assert.throws(() => assertNonOverlappingScopes(['Documents', 'documents']), /unique/u);
  }
});

test('archive paths use the canonical data root when data is reached through a junction', async (context) => {
  if (process.platform !== 'win32') return context.skip('Windows junction behavior');
  const root = await mkdtemp(join(tmpdir(), 'ila-backup-junction-'));
  const realData = join(root, 'real-data');
  const linkedData = join(root, 'linked-data');
  await mkdir(join(realData, 'documents'), { recursive: true });
  try {
    await symlink(realData, linkedData, 'junction');
    assert.equal(toArchivePath(linkedData, join(linkedData, 'documents')), 'documents');
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
