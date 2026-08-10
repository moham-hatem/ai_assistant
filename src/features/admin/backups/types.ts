export type {
  BackupCreateResponse,
  BackupListResponse,
  BackupSummary,
  BackupValidationResult,
} from '../../../../shared/contracts/backups';

export type BackupLoadStatus = 'error' | 'loading' | 'ready' | 'refreshing';
export type BackupOperationKind = 'create' | 'download' | 'validate';

export interface BackupOperation {
  backupId: string | null;
  id: number;
  kind: BackupOperationKind;
}

export type BackupNotice = 'created' | 'downloaded' | 'failed' | 'validated' | null;
