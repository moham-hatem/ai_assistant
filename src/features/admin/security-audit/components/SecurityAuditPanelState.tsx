import { FileSearch, RefreshCw, ShieldX } from 'lucide-react';
import type { SecurityAuditCopy } from '../copy';

export function SecurityAuditPanelState({ copy, kind, onRetry }: {
  copy: SecurityAuditCopy;
  kind: 'loading' | 'error' | 'empty';
  onRetry?: () => void;
}) {
  const Icon = kind === 'error' ? ShieldX : kind === 'empty' ? FileSearch : RefreshCw;
  const title = kind === 'error' ? copy.errorTitle : kind === 'empty' ? copy.emptyTitle : copy.loading;
  const body = kind === 'error' ? copy.errorBody : kind === 'empty' ? copy.emptyBody : undefined;
  return <div className="security-audit-panel-state" role="status">
    <Icon aria-hidden="true" className={kind === 'loading' ? 'security-audit-spin' : undefined} />
    <strong>{title}</strong>
    {body && <p>{body}</p>}
    {kind === 'error' && onRetry && <button type="button" onClick={onRetry}>{copy.retry}</button>}
  </div>;
}
