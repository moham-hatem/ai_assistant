import { DatabaseBackup, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { BackupsCopy } from '../copy';

export function BackupPanelState({ copy, kind, onRetry }: {
  copy: BackupsCopy;
  kind: 'empty' | 'error' | 'loading';
  onRetry?: () => void;
}) {
  if (kind === 'loading') return <div className="backups-panel-state" role="status">
    <LoaderCircle aria-hidden="true" className="backups-spin" size={30} />
    <p>{copy.loading}</p>
  </div>;
  const error = kind === 'error';
  return <div className={`backups-panel-state${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
    {error ? <TriangleAlert aria-hidden="true" size={30} /> : <DatabaseBackup aria-hidden="true" size={30} />}
    <h2>{error ? copy.errorTitle : copy.emptyTitle}</h2>
    <p>{error ? copy.errorBody : copy.emptyBody}</p>
    {error && onRetry && <button onClick={onRetry} type="button">{copy.retry}</button>}
  </div>;
}
