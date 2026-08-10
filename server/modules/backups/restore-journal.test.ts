import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RestoreJournal } from './restore-journal.ts';

test('restore journal durably replaces its complete state record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-restore-journal-'));
  const journal = new RestoreJournal(root, '11111111-1111-4111-8111-111111111111');
  try {
    await journal.write('prepared', []);
    await journal.write('swapping', [{
      installed: false, previousMoved: true, scope: 'books.sqlite', step: 'installing',
    }]);
    const record = JSON.parse(await readFile(join(root, 'restore-journal.json'), 'utf8')) as {
      backupId: string; phase: string; scopes: Array<{ previousMoved: boolean }>;
    };
    assert.equal(record.backupId, '11111111-1111-4111-8111-111111111111');
    assert.equal(record.phase, 'swapping');
    assert.equal(record.scopes[0]?.previousMoved, true);
    await assert.rejects(readFile(join(root, '.restore-journal.tmp')));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
