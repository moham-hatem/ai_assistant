import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DecodedBackup } from './archive-codec.ts';
import { resolveArchivePath } from './path-policy.ts';

export interface BackupRestoreCoordinator {
  afterRestore?(succeeded: boolean): Promise<void> | void;
  beforeRestore?(): Promise<void> | void;
}

interface SwapState {
  installed: boolean;
  previousMoved: boolean;
  rollback: string;
  target: string;
}

export async function restoreAtomically(
  dataDirectory: string,
  workDirectory: string,
  backup: DecodedBackup,
  coordinator: BackupRestoreCoordinator = {},
): Promise<void> {
  const incoming = join(workDirectory, 'incoming');
  const rollbackRoot = join(workDirectory, 'rollback');
  await extract(incoming, backup);
  let succeeded = false;
  const states: SwapState[] = [];
  try {
    await coordinator.beforeRestore?.();
    for (const scope of backup.manifest.scopes) {
      const target = resolveArchivePath(dataDirectory, scope);
      const staged = join(incoming, ...scope.split('/'));
      const rollback = join(rollbackRoot, ...scope.split('/'));
      await mkdir(dirname(target), { recursive: true });
      const state = { installed: false, previousMoved: false, rollback, target };
      states.push(state);
      if (await exists(target)) {
        await mkdir(dirname(rollback), { recursive: true });
        await rename(target, rollback);
        state.previousMoved = true;
      }
      await rename(staged, target);
      state.installed = true;
    }
    succeeded = true;
  } catch (error) {
    await rollback(states);
    throw error;
  } finally {
    await coordinator.afterRestore?.(succeeded);
  }
}

async function extract(root: string, backup: DecodedBackup): Promise<void> {
  for (const [archivePath, contents] of backup.payload) {
    const destination = join(root, ...archivePath.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents, { flag: 'wx', mode: 0o600 });
  }
}

async function rollback(states: SwapState[]): Promise<void> {
  for (const state of [...states].reverse()) {
    if (state.installed) await rm(state.target, { force: true, recursive: true });
    if (state.previousMoved) await rename(state.rollback, state.target);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}
