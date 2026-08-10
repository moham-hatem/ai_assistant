import { LOCAL_BACKUP_CONTENT_TYPE } from '../../../../../shared/contracts/backups';
import { adminFetch } from '../../api/admin-fetch';
import type { BackupSummary, BackupValidationResult } from '../types';
import { BackupApiError } from './backup-api-error';
import { parseBackupCreate, parseBackupList, parseBackupValidation } from './backup-parser';

export interface BackupDownload {
  blob: Blob;
  fileName: string;
}

export async function fetchBackups(signal?: AbortSignal): Promise<BackupSummary[]> {
  return parseBackupList(await readJson(await adminFetch('/api/internal/backups', { signal })));
}

export async function createBackup(signal?: AbortSignal): Promise<BackupSummary> {
  const response = await adminFetch('/api/internal/backups', { method: 'POST', signal });
  return parseBackupCreate(await readJson(response));
}

export async function validateBackup(id: string, signal?: AbortSignal): Promise<BackupValidationResult> {
  const response = await adminFetch(`/api/internal/backups/${encodeURIComponent(id)}/validate`, {
    method: 'POST', signal,
  });
  return parseBackupValidation(await readJson(response));
}

export async function downloadBackup(id: string, signal?: AbortSignal): Promise<BackupDownload> {
  const response = await adminFetch(`/api/internal/backups/${encodeURIComponent(id)}/download`, { signal });
  if (!response.ok) throw await responseError(response);
  if (response.headers.get('content-type') !== LOCAL_BACKUP_CONTENT_TYPE) {
    throw new BackupApiError('Backup download returned an invalid content type.', response.status);
  }
  const fileName = parseAttachmentName(response.headers.get('content-disposition'));
  const blob = await response.blob();
  if (blob.size === 0) throw new BackupApiError('Backup download returned an empty artifact.', response.status);
  return { blob, fileName };
}

async function readJson(response: Response): Promise<unknown> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new BackupApiError('Backup API returned invalid JSON.', response.status);
  }
  if (!response.ok) throw responseErrorFromValue(response.status, value);
  return value;
}

async function responseError(response: Response): Promise<BackupApiError> {
  let value: unknown;
  try { value = await response.json(); } catch { value = null; }
  return responseErrorFromValue(response.status, value);
}

function responseErrorFromValue(status: number, value: unknown): BackupApiError {
  const code = value && typeof value === 'object' && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).code === 'string'
    ? String((value as Record<string, unknown>).code)
    : 'REQUEST_FAILED';
  return new BackupApiError(code, status);
}

function parseAttachmentName(value: string | null): string {
  const match = value?.match(/^attachment; filename="([A-Za-z0-9._-]{1,200}\.ilabackup)"$/u);
  if (!match) throw new BackupApiError('Backup download returned an invalid filename.');
  return match[1];
}
