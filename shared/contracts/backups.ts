export const LOCAL_BACKUP_FORMAT = 'islamic-learning-assistant.local-backup' as const;
export const LOCAL_BACKUP_FORMAT_VERSION = 1 as const;
export const LOCAL_BACKUP_CONTENT_TYPE = 'application/vnd.islamic-learning-assistant.backup';
export const LOCAL_BACKUP_FILE_EXTENSION = '.ilabackup';

export type BackupEntryKind = 'file' | 'sqlite';

export interface BackupManifestEntry {
  kind: BackupEntryKind;
  path: string;
  sha256: string;
  size: number;
}

export interface BackupManifest {
  appVersion: string;
  createdAt: string;
  fileCount: number;
  format: typeof LOCAL_BACKUP_FORMAT;
  formatVersion: typeof LOCAL_BACKUP_FORMAT_VERSION;
  id: string;
  manifestChecksum: string;
  files: BackupManifestEntry[];
  scopes: string[];
  totalBytes: number;
}

export interface BackupSummary {
  appVersion: string;
  artifactBytes: number;
  artifactSha256: string;
  createdAt: string;
  fileCount: number;
  formatVersion: number;
  id: string;
  totalBytes: number;
}

export interface BackupListResponse {
  backups: BackupSummary[];
  requestId: string;
}

export interface BackupCreateResponse {
  backup: BackupSummary;
  requestId: string;
}

export interface BackupValidationResult {
  checkedAt: string;
  fileCount: number;
  id: string;
  status: 'valid';
  totalBytes: number;
}

export interface BackupRestoreResult {
  backupId: string;
  completedAt: string;
  restoredFiles: number;
}
