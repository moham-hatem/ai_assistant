import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createBackup, downloadBackup, fetchBackups, validateBackup } from '../api/backups';
import { backupsReducer, createBackupsState } from '../backup-state';
import { saveBackupDownload } from '../download';
import { createBackupOperationLock } from '../operation-lock';
import type { BackupOperationKind } from '../types';

export function useBackups() {
  const [state, dispatch] = useReducer(backupsReducer, undefined, createBackupsState);
  const mounted = useRef(true);
  const operationLock = useRef(createBackupOperationLock());
  const sequence = useRef(0);
  const loadSequence = useRef(0);
  const operationController = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operationController.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadId = loadSequence.current + 1;
    loadSequence.current = loadId;
    dispatch({ loadId, mutationVersion: state.mutationVersion, type: 'load-started' });
    void fetchBackups(controller.signal)
      .then((backups) => {
        if (!controller.signal.aborted) dispatch({ backups, loadId, type: 'loaded' });
      })
      .catch(() => {
        if (!controller.signal.aborted) dispatch({ loadId, type: 'load-failed' });
      });
    return () => controller.abort();
  }, [state.reloadKey]);

  const run = useCallback(async (
    kind: BackupOperationKind,
    backupId: string | null,
  ): Promise<boolean> => {
    const result = await operationLock.current.run(async () => {
      const id = sequence.current + 1;
      sequence.current = id;
      const controller = new AbortController();
      operationController.current = controller;
      dispatch({ operation: { backupId, id, kind }, type: 'operation-started' });
      try {
        if (kind === 'create') {
          const backup = await createBackup(controller.signal);
          if (mounted.current && !controller.signal.aborted) dispatch({ backup, operationId: id, type: 'created' });
        } else if (kind === 'validate' && backupId) {
          const validation = await validateBackup(backupId, controller.signal);
          if (mounted.current && !controller.signal.aborted) dispatch({ operationId: id, type: 'validated', validation });
        } else if (kind === 'download' && backupId) {
          const download = await downloadBackup(backupId, controller.signal);
          if (mounted.current && !controller.signal.aborted) {
            saveBackupDownload(download);
            dispatch({ operationId: id, type: 'downloaded' });
          }
        } else {
          throw new Error('Backup operation is incomplete.');
        }
        return true;
      } catch {
        if (mounted.current && !controller.signal.aborted) dispatch({ operationId: id, type: 'operation-failed' });
        return false;
      } finally {
        if (operationController.current === controller) operationController.current = null;
      }
    });
    return result.started ? result.value : false;
  }, []);

  return {
    create: () => run('create', null),
    dispatch,
    download: (id: string) => run('download', id),
    state,
    validate: (id: string) => run('validate', id),
  };
}
