import type { BackupSummary, BackupValidationResult } from './types';
import type { BackupLoadStatus, BackupNotice, BackupOperation } from './types';

export interface BackupsState {
  activeLoadId: number;
  activeLoadMutationVersion: number;
  backups: BackupSummary[];
  loadStatus: BackupLoadStatus;
  mutationVersion: number;
  notice: BackupNotice;
  operation: BackupOperation | null;
  reloadKey: number;
  validatedAt: Record<string, string>;
}

export type BackupsAction =
  | { loadId: number; mutationVersion: number; type: 'load-started' }
  | { backups: BackupSummary[]; loadId: number; type: 'loaded' }
  | { loadId: number; type: 'load-failed' }
  | { type: 'retry' }
  | { operation: BackupOperation; type: 'operation-started' }
  | { backup: BackupSummary; operationId: number; type: 'created' }
  | { operationId: number; type: 'downloaded' }
  | { operationId: number; type: 'operation-failed' }
  | { operationId: number; type: 'validated'; validation: BackupValidationResult }
  | { type: 'notice-cleared' };

export function createBackupsState(): BackupsState {
  return {
    activeLoadId: 0,
    activeLoadMutationVersion: 0,
    backups: [],
    loadStatus: 'loading',
    mutationVersion: 0,
    notice: null,
    operation: null,
    reloadKey: 0,
    validatedAt: {},
  };
}

export function backupsReducer(state: BackupsState, action: BackupsAction): BackupsState {
  switch (action.type) {
    case 'load-started':
      return {
        ...state,
        activeLoadId: action.loadId,
        activeLoadMutationVersion: action.mutationVersion,
        loadStatus: state.backups.length ? 'refreshing' : 'loading',
      };
    case 'loaded':
      return action.loadId === state.activeLoadId
        ? {
            ...state,
            backups: state.activeLoadMutationVersion < state.mutationVersion
              ? mergeBackups(state.backups, action.backups)
              : newestFirst(action.backups),
            loadStatus: 'ready',
          }
        : state;
    case 'load-failed':
      if (action.loadId !== state.activeLoadId) return state;
      return state.backups.length
        ? { ...state, loadStatus: 'ready', notice: 'failed' }
        : { ...state, loadStatus: 'error' };
    case 'retry':
      return {
        ...state,
        loadStatus: state.backups.length ? 'refreshing' : 'loading',
        reloadKey: state.reloadKey + 1,
      };
    case 'operation-started':
      return state.operation ? state : { ...state, notice: null, operation: action.operation };
    case 'created':
      if (!isCurrent(state, action.operationId, 'create')) return state;
      return {
        ...state,
        backups: newestFirst([action.backup, ...state.backups.filter((item) => item.id !== action.backup.id)]),
        notice: 'created',
        mutationVersion: state.mutationVersion + 1,
        operation: null,
      };
    case 'validated':
      if (!isCurrent(state, action.operationId, 'validate', action.validation.id)) return state;
      return {
        ...state,
        notice: 'validated',
        operation: null,
        validatedAt: { ...state.validatedAt, [action.validation.id]: action.validation.checkedAt },
      };
    case 'downloaded':
      return isCurrent(state, action.operationId, 'download')
        ? { ...state, notice: 'downloaded', operation: null }
        : state;
    case 'operation-failed':
      return state.operation?.id === action.operationId
        ? { ...state, notice: 'failed', operation: null }
        : state;
    case 'notice-cleared':
      return { ...state, notice: null };
  }
}

export function isBackupBusy(state: BackupsState, kind: BackupOperation['kind'], id?: string): boolean {
  return state.operation?.kind === kind && (id === undefined || state.operation.backupId === id);
}

function isCurrent(
  state: BackupsState,
  id: number,
  kind: BackupOperation['kind'],
  backupId?: string,
): boolean {
  return state.operation?.id === id
    && state.operation.kind === kind
    && (backupId === undefined || state.operation.backupId === backupId);
}

function newestFirst(backups: BackupSummary[]): BackupSummary[] {
  return [...backups].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function mergeBackups(current: BackupSummary[], incoming: BackupSummary[]): BackupSummary[] {
  const merged = new Map(current.map((backup) => [backup.id, backup]));
  for (const backup of incoming) merged.set(backup.id, backup);
  return newestFirst([...merged.values()]);
}
