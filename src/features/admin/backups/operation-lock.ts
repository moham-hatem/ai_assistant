export interface BackupOperationLock {
  isActive(): boolean;
  run<T>(operation: () => Promise<T>): Promise<{ started: false } | { started: true; value: T }>;
}

export function createBackupOperationLock(): BackupOperationLock {
  let active = false;
  return {
    isActive: () => active,
    run: async <T>(operation: () => Promise<T>) => {
      if (active) return { started: false } as const;
      active = true;
      try {
        return { started: true, value: await operation() } as const;
      } finally {
        active = false;
      }
    },
  };
}
