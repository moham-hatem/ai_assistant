export interface ActionLock {
  isActive: () => boolean;
  run: <T>(operation: () => Promise<T>) => Promise<ActionLockResult<T>>;
}
export type ActionLockResult<T> =
  | { started: false }
  | { started: true; value: T };

export function createActionLock(): ActionLock {
  let active = false;
  return {
    isActive: () => active,
    run: async <T>(operation: () => Promise<T>): Promise<ActionLockResult<T>> => {
      if (active) return { started: false };
      active = true;
      try {
        return { started: true, value: await operation() };
      } finally {
        active = false;
      }
    },
  };
}
