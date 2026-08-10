import { copyFile, lstat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteAuthRepository } from '../../auth/sqlite-repository.ts';
import { TelegramStore } from '../../channels/telegram/store.ts';
import { SqliteBookRepository } from '../books/sqlite-book-repository.ts';
import { SqliteFeedbackRepository } from '../feedback/sqlite-feedback-repository.ts';
import { SqliteQualityMetricsRepository } from '../quality-metrics/sqlite-quality-metrics-repository.ts';
import { SqliteQuestionLogRepository } from '../question-log/sqlite-question-log-repository.ts';
import { SqliteReviewRepository } from '../reviews/sqlite-review-repository.ts';
import type { SecurityAuditConfigResolution } from '../security-audit/config.ts';
import { SqliteSecurityAuditRepository } from '../security-audit/sqlite-repository.ts';
import { AppError } from '../../errors.ts';
import { toArchivePath } from './path-policy.ts';

export interface BackupDomainPreflightConfig {
  authDatabasePath: string;
  booksDatabasePath: string;
  dataDirectory: string;
  questionDatabasePath: string;
  securityAudit: SecurityAuditConfigResolution;
  securityAuditDatabasePath: string;
  telegramDatabasePath: string;
  telegramSessionSecret?: string;
}

export interface BackupDomainPreflightReport {
  checkedDomains: string[];
}

export async function validateRestoredDomains(
  config: BackupDomainPreflightConfig,
  incomingRoot: string,
): Promise<BackupDomainPreflightReport> {
  const preflightRoot = await mkdtemp(join(dirname(incomingRoot), 'domain-preflight-'));
  const checkedDomains: string[] = [];
  try {
    const booksDatabasePath = await copyIncomingDatabase(
      config, incomingRoot, preflightRoot, config.booksDatabasePath,
    );
    if (booksDatabasePath) {
      assertSupportedBookVersion(booksDatabasePath);
      usingRepository(() => new SqliteBookRepository(booksDatabasePath));
      checkedDomains.push('books');
    }
    const questionDatabasePath = await copyIncomingDatabase(
      config, incomingRoot, preflightRoot, config.questionDatabasePath,
    );
    if (questionDatabasePath) {
      usingRepository(() => new SqliteQuestionLogRepository(questionDatabasePath));
      usingRepository(() => new SqliteReviewRepository(questionDatabasePath));
      usingRepository(() => new SqliteFeedbackRepository(questionDatabasePath));
      usingRepository(() => new SqliteQualityMetricsRepository(questionDatabasePath));
      checkedDomains.push('questions-reviews-feedback-quality');
    }
    const authDatabasePath = await copyIncomingDatabase(
      config, incomingRoot, preflightRoot, config.authDatabasePath,
    );
    if (authDatabasePath) {
      usingRepository(() => new SqliteAuthRepository(authDatabasePath));
      checkedDomains.push('auth');
    }
    const securityAuditDatabasePath = await copyIncomingDatabase(
      config, incomingRoot, preflightRoot, config.securityAuditDatabasePath,
    );
    if (securityAuditDatabasePath) {
      if (!config.securityAudit.config) throw invalid(config.securityAudit.setupError);
      const audit = new SqliteSecurityAuditRepository(
        securityAuditDatabasePath,
        config.securityAudit.config.keys,
        config.securityAudit.config.currentKeyVersion,
      );
      try {
        const integrity = await audit.verifyIntegrity(new Date().toISOString());
        if (integrity.status !== 'valid') {
          throw invalid('Restored security audit HMAC chain is not valid.');
        }
      } finally {
        audit.close();
      }
      checkedDomains.push('security-audit');
    }
    const telegramDatabasePath = await copyIncomingDatabase(
      config, incomingRoot, preflightRoot, config.telegramDatabasePath,
    );
    if (telegramDatabasePath) {
      if (!config.telegramSessionSecret) {
        throw invalid('TELEGRAM_SESSION_SECRET is required to preflight the restored Telegram database.');
      }
      const telegram = new TelegramStore(telegramDatabasePath, config.telegramSessionSecret);
      try { telegram.getLanguage('0'.repeat(64)); }
      finally { telegram.close(); }
      checkedDomains.push('telegram');
    }
    return { checkedDomains };
  } finally {
    await rm(preflightRoot, { force: true, recursive: true });
  }
}

function assertSupportedBookVersion(path: string): void {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const row = database.prepare('PRAGMA user_version').get() as unknown as { user_version: number };
    if (row.user_version > 2) {
      throw invalid(`Book database schema version ${row.user_version} is newer than supported.`);
    }
  } finally {
    database.close();
  }
}

function usingRepository(factory: () => { close(): void }): void {
  const repository = factory();
  try { /* Constructors perform strict migration-history and schema compatibility checks. */ }
  finally { repository.close(); }
}

async function copyIncomingDatabase(
  config: BackupDomainPreflightConfig,
  incomingRoot: string,
  preflightRoot: string,
  livePath: string,
): Promise<string | null> {
  const archivePath = toArchivePath(config.dataDirectory, livePath);
  const source = join(incomingRoot, ...archivePath.split('/'));
  if (!await isFile(source)) return null;
  const destination = join(preflightRoot, ...archivePath.split('/'));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return destination;
}

async function isFile(path: string): Promise<boolean> {
  try { return (await lstat(path)).isFile(); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function invalid(message: string): AppError {
  return new AppError('INVALID_REQUEST', message, 422);
}
