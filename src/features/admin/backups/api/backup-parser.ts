import type {
  BackupSummary,
  BackupValidationResult,
} from '../../../../../shared/contracts/backups';
import { LOCAL_BACKUP_FORMAT_VERSION } from '../../../../../shared/contracts/backups';
import { BackupApiError } from './backup-api-error';

const checksum = /^[0-9a-f]{64}$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const requestId = /^[A-Za-z0-9._:-]{1,128}$/u;
const version = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u;

export function parseBackupList(value: unknown): BackupSummary[] {
  const response = object(value, 'list response');
  exactKeys(response, ['backups', 'requestId'], 'list response');
  pattern(response.requestId, requestId, 'requestId');
  if (!Array.isArray(response.backups)) invalid('backups');
  const backups = response.backups.map(parseBackupSummary);
  if (new Set(backups.map((backup) => backup.id)).size !== backups.length) invalid('duplicate backup');
  return backups;
}

export function parseBackupCreate(value: unknown): BackupSummary {
  const response = object(value, 'create response');
  exactKeys(response, ['backup', 'requestId'], 'create response');
  pattern(response.requestId, requestId, 'requestId');
  return parseBackupSummary(response.backup);
}

export function parseBackupValidation(value: unknown): BackupValidationResult {
  const response = object(value, 'validation response');
  exactKeys(response, ['requestId', 'validation'], 'validation response');
  pattern(response.requestId, requestId, 'requestId');
  const validation = object(response.validation, 'validation');
  exactKeys(validation, ['checkedAt', 'fileCount', 'id', 'status', 'totalBytes'], 'validation');
  if (validation.status !== 'valid') invalid('validation status');
  return {
    checkedAt: timestamp(validation.checkedAt, 'checkedAt'),
    fileCount: positiveInteger(validation.fileCount, 'fileCount'),
    id: pattern(validation.id, uuid, 'id'),
    status: 'valid',
    totalBytes: positiveInteger(validation.totalBytes, 'totalBytes'),
  };
}

export function parseBackupSummary(value: unknown): BackupSummary {
  const backup = object(value, 'backup');
  exactKeys(backup, [
    'appVersion', 'artifactBytes', 'artifactSha256', 'createdAt', 'fileCount',
    'formatVersion', 'id', 'totalBytes',
  ], 'backup');
  const appVersion = pattern(backup.appVersion, version, 'appVersion');
  const formatVersion = integer(backup.formatVersion, 'formatVersion');
  if (formatVersion !== LOCAL_BACKUP_FORMAT_VERSION) invalid('formatVersion');
  return {
    appVersion,
    artifactBytes: positiveInteger(backup.artifactBytes, 'artifactBytes'),
    artifactSha256: pattern(backup.artifactSha256, checksum, 'artifactSha256'),
    createdAt: timestamp(backup.createdAt, 'createdAt'),
    fileCount: positiveInteger(backup.fileCount, 'fileCount'),
    formatVersion,
    id: pattern(backup.id, uuid, 'id'),
    totalBytes: positiveInteger(backup.totalBytes, 'totalBytes'),
  };
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid(field);
}

function integer(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid(field);
  return value as number;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = integer(value, field);
  if (parsed < 1) invalid(field);
  return parsed;
}

function pattern(value: unknown, expression: RegExp, field: string): string {
  const parsed = text(value, field, 256);
  if (!expression.test(parsed)) invalid(field);
  return parsed;
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.trim() !== value) invalid(field);
  return value;
}

function timestamp(value: unknown, field: string): string {
  const parsed = text(value, field, 64);
  const milliseconds = Date.parse(parsed);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== parsed) invalid(field);
  return parsed;
}

function invalid(field: string): never {
  throw new BackupApiError(`Backup API returned an invalid ${field}.`);
}
