import { isAbsolute, resolve } from 'node:path';
import { createLocalConfig } from '../../config.ts';
import { resolveSecurityAuditConfig } from '../security-audit/config.ts';
import { validateRestoredDomains, type BackupDomainPreflightReport } from './domain-preflight.ts';
import type { BackupServiceConfig } from './service.ts';

export interface BackupMaintenanceConfig {
  backup: Omit<BackupServiceConfig, 'restoreCoordinator'>;
  databasePaths: string[];
  preflightRestoredDomains?(incomingRoot: string): Promise<BackupDomainPreflightReport>;
}

export function createBackupMaintenanceConfig(
  env: Record<string, string | undefined>,
  cwd: string,
): BackupMaintenanceConfig {
  const defined = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const runtime = createLocalConfig(defined, cwd);
  const dataDirectory = runtime.dataDirectory;
  const authDatabasePath = configuredPath(env.AUTH_DATABASE_PATH, 'data/auth.sqlite', cwd);
  const securityAuditDatabasePath = configuredPath(
    env.SECURITY_AUDIT_DATABASE_FILE,
    'data/security-audit.sqlite',
    cwd,
  );
  const telegramDatabasePath = configuredPath(env.TELEGRAM_DATABASE_FILE, 'data/telegram.sqlite', cwd);
  const databasePaths = unique([
    runtime.booksDatabaseFile,
    runtime.questionLogDatabaseFile,
    authDatabasePath,
    securityAuditDatabasePath,
    telegramDatabasePath,
  ].filter((path): path is string => path !== null));
  return {
    backup: {
      appVersion: runtime.appVersion,
      backupDirectory: runtime.backupDirectory,
      dataDirectory,
      directoryScopes: [runtime.documentDirectory, runtime.knowledgeDirectory],
      sqliteFiles: databasePaths,
    },
    databasePaths,
    preflightRestoredDomains: async (incomingRoot) => validateRestoredDomains({
      authDatabasePath: authDatabasePath ?? resolve(dataDirectory, 'auth.sqlite'),
      booksDatabasePath: runtime.booksDatabaseFile,
      dataDirectory,
      questionDatabasePath: runtime.questionLogDatabaseFile,
      securityAudit: resolveSecurityAuditConfig(env, cwd),
      securityAuditDatabasePath: securityAuditDatabasePath ?? resolve(dataDirectory, 'security-audit.sqlite'),
      telegramDatabasePath: telegramDatabasePath ?? resolve(dataDirectory, 'telegram.sqlite'),
      telegramSessionSecret: env.TELEGRAM_SESSION_SECRET?.trim() || undefined,
    }, incomingRoot),
  };
}

function configuredPath(value: string | undefined, fallback: string, cwd: string): string | null {
  const selected = value?.trim() || fallback;
  if (selected === ':memory:') return null;
  if (!selected || selected.includes('\0')) throw new Error('Maintenance database path is invalid.');
  return isAbsolute(selected) ? selected : resolve(cwd, selected);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
