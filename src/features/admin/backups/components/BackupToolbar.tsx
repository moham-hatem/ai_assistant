import { DatabaseBackup, RefreshCw } from 'lucide-react';
import type { BackupsCopy } from '../copy';
import type { BackupsState } from '../backup-state';

export function BackupToolbar({ copy, onCreate, onRefresh, state }: {
  copy: BackupsCopy;
  onCreate: () => void;
  onRefresh: () => void;
  state: BackupsState;
}) {
  const busy = state.operation !== null;
  const creating = state.operation?.kind === 'create';
  return <section className="backups-toolbar" aria-label={copy.title}>
    <div>
      <DatabaseBackup aria-hidden="true" size={24} />
      <p>{copy.intro}</p>
    </div>
    <div className="backups-toolbar-actions">
      <button disabled={busy || state.loadStatus === 'loading'} onClick={onCreate} type="button">
        <DatabaseBackup aria-hidden="true" size={17} />
        {creating ? copy.creating : copy.create}
      </button>
      <button className="is-secondary" disabled={busy || state.loadStatus === 'loading' || state.loadStatus === 'refreshing'} onClick={onRefresh} type="button">
        <RefreshCw aria-hidden="true" className={state.loadStatus === 'refreshing' ? 'backups-spin' : ''} size={17} />
        {copy.refresh}
      </button>
    </div>
  </section>;
}
