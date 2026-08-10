import { open, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type RestoreJournalPhase = 'prepared' | 'rolling-back' | 'rolled-back' | 'swapping' | 'validated';

export interface RestoreJournalScope {
  installed: boolean;
  previousMoved: boolean;
  scope: string;
  step: 'installing' | 'moving-previous' | 'ready' | 'rolling-back';
}

interface RestoreJournalRecord {
  backupId: string;
  phase: RestoreJournalPhase;
  scopes: RestoreJournalScope[];
  updatedAt: string;
  version: 1;
}

export class RestoreJournal {
  private readonly path: string;
  private readonly temporaryPath: string;

  constructor(workDirectory: string, private readonly backupId: string) {
    this.path = join(workDirectory, 'restore-journal.json');
    this.temporaryPath = join(workDirectory, '.restore-journal.tmp');
  }

  async write(phase: RestoreJournalPhase, scopes: readonly RestoreJournalScope[]): Promise<void> {
    const record: RestoreJournalRecord = {
      backupId: this.backupId,
      phase,
      scopes: scopes.map((scope) => ({ ...scope })),
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    const handle = await open(this.temporaryPath, 'w', 0o600);
    try {
      await handle.writeFile(JSON.stringify(record));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(this.temporaryPath, this.path);
    const durable = await open(this.path, 'r+');
    try { await durable.sync(); }
    finally { await durable.close(); }
    await syncDirectoryBestEffort(dirname(this.path));
  }
}

export async function syncDirectoryBestEffort(path: string): Promise<void> {
  try {
    const directory = await open(path, 'r');
    try { await directory.sync(); }
    finally { await directory.close(); }
  } catch (error) {
    if (!unsupportedDirectorySync(error)) throw error;
  }
}

function unsupportedDirectorySync(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return ['EACCES', 'EINVAL', 'EISDIR', 'ENOTSUP', 'EPERM'].includes(String(error.code));
}
