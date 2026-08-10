import assert from 'node:assert/strict';
import { lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acquireMaintenanceAdmission } from '../../modules/backups/runtime-admission.ts';
import { runTelegramBot } from './run.ts';

test('Telegram acquires runtime admission before opening its SQLite store', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-telegram-admission-'));
  const backupDirectory = join(root, 'data', 'backups');
  const telegramDatabase = join(root, 'data', 'telegram.sqlite');
  const maintenance = await acquireMaintenanceAdmission(backupDirectory);
  try {
    await assert.rejects(runTelegramBot({
      BACKUP_DIRECTORY: backupDirectory,
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_DATABASE_FILE: telegramDatabase,
      TELEGRAM_SESSION_SECRET: 's'.repeat(32),
    }, root), /Maintenance is active/u);
    await assert.rejects(lstat(telegramDatabase), { code: 'ENOENT' });
  } finally {
    await maintenance.release();
    await rm(root, { force: true, recursive: true });
  }
});
