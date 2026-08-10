import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { backupsCopies } from '../../src/features/admin/backups/copy/index.ts';

test('backup copy is genuine Arabic, English, and Kiswahili with explicit maintenance guidance', () => {
  assert.match(backupsCopies.ar.title, /[\u0600-\u06ff]/u);
  assert.match(backupsCopies.en.maintenanceBody, /stopping the server/u);
  assert.match(backupsCopies.sw.maintenanceBody, /kusimamisha seva/u);
  for (const copy of Object.values(backupsCopies)) {
    assert.equal(copy.maintenanceBody.length > 80, true);
    assert.doesNotMatch(Object.values(copy).join(' '), /(?:Ã|Â|Ø|Ù)/u);
  }
});

test('backup UI contains no live restore action', async () => {
  const sources = await Promise.all([
    'src/features/admin/backups/components/BackupToolbar.tsx',
    'src/features/admin/backups/components/BackupList.tsx',
    'src/features/admin/backups/containers/BackupsWorkspace.tsx',
    'src/features/admin/backups/hooks/useBackups.ts',
  ].map((path) => readFile(path, 'utf8')));
  assert.doesNotMatch(sources.join('\n'), /(?:restoreBackup|onRestore|kind:\s*['"]restore)/u);
});

test('backup feature does not persist, log, or call a restore endpoint', async () => {
  const root = 'src/features/admin/backups';
  const entries = await readdir(root, { recursive: true });
  const sources = await Promise.all(entries
    .filter((entry) => /\.(?:ts|tsx)$/u.test(entry))
    .map((entry) => readFile(`${root}/${entry.replaceAll('\\', '/')}`, 'utf8')));
  const source = sources.join('\n');
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage|console\.|\/restore\b)/u);
});
