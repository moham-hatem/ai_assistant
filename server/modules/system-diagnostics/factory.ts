import { isAbsolute, resolve } from 'node:path';
import type { SecurityAuditIntegritySummary } from '../../../shared/contracts/security-audit.ts';
import type { LocalRuntimeConfig } from '../../config.ts';
import { resolveSecurityAuditConfig } from '../security-audit/config.ts';
import { SystemDiagnosticsService } from './service.ts';

export interface LocalSystemDiagnosticsOptions {
  appVersion: string;
  auditConfigured?: boolean;
  cwd?: string;
  env?: Record<string, string | undefined>;
  verifyAuditIntegrity?: () => Promise<SecurityAuditIntegritySummary>;
}

export function createLocalSystemDiagnosticsService(
  config: LocalRuntimeConfig,
  options: LocalSystemDiagnosticsOptions,
): SystemDiagnosticsService {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const auditResolution = resolveSecurityAuditConfig(env, cwd);
  return new SystemDiagnosticsService({
    appVersion: options.appVersion,
    audit: {
      configured: options.auditConfigured ?? Boolean(auditResolution.config),
      verifyIntegrity: options.verifyAuditIntegrity,
    },
    databases: [
      { id: 'database.books', path: config.booksDatabaseFile },
      { id: 'database.questions', path: config.questionLogDatabaseFile },
      { id: 'database.auth', path: resolveConfiguredPath(cwd, env.AUTH_DATABASE_PATH, 'data/auth.sqlite') },
    ],
    model: {
      localConfigured: Boolean(config.translation.model.trim()),
      remoteConfigured: Boolean(config.openCode.apiKey),
    },
    ocr: {
      pdftoppmPath: config.ocr.pdftoppmPath,
      tesseractPath: config.ocr.tesseractPath,
    },
    paths: {
      data: resolve(cwd, 'data'),
      documents: config.documentDirectory,
      knowledge: config.knowledgeDirectory,
    },
    workspaceRoot: cwd,
  });
}

function resolveConfiguredPath(cwd: string, value: string | undefined, fallback: string): string {
  const configured = value?.trim() || fallback;
  if (configured === ':memory:' || isAbsolute(configured)) return configured;
  return resolve(cwd, configured);
}
