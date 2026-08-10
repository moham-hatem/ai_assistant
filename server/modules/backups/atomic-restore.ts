import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DecodedBackup } from './archive-codec.ts';
import { resolveArchivePath } from './path-policy.ts';
import {
  RestoreJournal,
  syncDirectoryBestEffort,
  type RestoreJournalScope,
} from './restore-journal.ts';
import { RestoreRecoveryRequiredError } from './recovery-required.ts';

export interface BackupRestoreCoordinator {
  afterRestore?(succeeded: boolean): Promise<void> | void;
  beforeRestore?(): Promise<void> | void;
  preflightIncoming?(incomingRoot: string, backup: DecodedBackup): Promise<void> | void;
  validateRestored?(backup: DecodedBackup): Promise<void> | void;
}

interface SwapState {
  installed: boolean;
  previousMoved: boolean;
  rollback: string;
  scope: string;
  step: RestoreJournalScope['step'];
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
  const journal = new RestoreJournal(workDirectory, backup.manifest.id);
  await journal.write('prepared', []);
  await coordinator.preflightIncoming?.(incoming, backup);
  let succeeded = false;
  let recoveryFailure: RestoreRecoveryRequiredError | undefined;
  const states: SwapState[] = [];
  try {
    await coordinator.beforeRestore?.();
    for (const scope of backup.manifest.scopes) {
      const target = resolveArchivePath(dataDirectory, scope);
      const staged = join(incoming, ...scope.split('/'));
      const rollback = join(rollbackRoot, ...scope.split('/'));
      await mkdir(dirname(target), { recursive: true });
      const state: SwapState = {
        installed: false, previousMoved: false, rollback, scope, step: 'ready', target,
      };
      states.push(state);
      if (await exists(target)) {
        await mkdir(dirname(rollback), { recursive: true });
        state.step = 'moving-previous';
        await writeJournal(journal, 'swapping', states);
        await durableRename(target, rollback);
        state.previousMoved = true;
        state.step = 'ready';
        await writeJournal(journal, 'swapping', states);
      }
      state.step = 'installing';
      await writeJournal(journal, 'swapping', states);
      await durableRename(staged, target);
      state.installed = true;
      state.step = 'ready';
      await writeJournal(journal, 'swapping', states);
    }
    await coordinator.validateRestored?.(backup);
    await writeJournal(journal, 'validated', states);
    succeeded = true;
  } catch (error) {
    try {
      await rollback(states, journal);
    } catch (rollbackError) {
      recoveryFailure = new RestoreRecoveryRequiredError(
        'Restore rollback did not complete. Keep the maintenance lock and inspect the restore journal before recovery.',
        { originalError: error, rollbackError },
      );
      throw recoveryFailure;
    }
    throw error;
  } finally {
    try { await coordinator.afterRestore?.(succeeded); }
    catch (error) {
      if (recoveryFailure) throw recoveryFailure;
      throw error;
    }
  }
}

async function extract(root: string, backup: DecodedBackup): Promise<void> {
  for (const [archivePath, contents] of backup.payload) {
    const destination = join(root, ...archivePath.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents, { flag: 'wx', mode: 0o600 });
  }
}

async function rollback(states: SwapState[], journal: RestoreJournal): Promise<void> {
  await writeJournal(journal, 'rolling-back', states);
  for (const state of [...states].reverse()) {
    state.step = 'rolling-back';
    await writeJournal(journal, 'rolling-back', states);
    if (state.installed) {
      await rm(state.target, { force: true, recursive: true });
      await syncDirectoryBestEffort(dirname(state.target));
    }
    state.installed = false;
    if (state.previousMoved) await durableRename(state.rollback, state.target);
    state.previousMoved = false;
    state.step = 'ready';
    await writeJournal(journal, 'rolling-back', states);
  }
  await writeJournal(journal, 'rolled-back', states);
}

async function durableRename(source: string, destination: string): Promise<void> {
  await rename(source, destination);
  await syncDirectoryBestEffort(dirname(source));
  if (dirname(source) !== dirname(destination)) await syncDirectoryBestEffort(dirname(destination));
}

function writeJournal(
  journal: RestoreJournal,
  phase: Parameters<RestoreJournal['write']>[0],
  states: readonly SwapState[],
): Promise<void> {
  return journal.write(phase, states.map(({ installed, previousMoved, scope, step }) => ({
    installed, previousMoved, scope, step,
  })));
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
