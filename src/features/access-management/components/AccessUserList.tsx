import type { AccessUserPage } from '../../../../shared/contracts/access-management';
import type { AccessCopy } from '../access-copy';
import type { LoadStatus } from '../access-state';

interface AccessUserListProps {
  canGoBack: boolean;
  copy: AccessCopy;
  disabled: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onRetry: () => void;
  onSelect: (id: string) => void;
  page: AccessUserPage | null;
  selectedId: string | null;
  status: LoadStatus;
}

export function AccessUserList(props: AccessUserListProps) {
  if (props.status === 'loading') return <div className="access-panel-state" role="status">{props.copy.loading}</div>;
  if (props.status === 'error') return <div className="access-panel-state" role="alert"><p>{props.copy.listError}</p><button onClick={props.onRetry} type="button">{props.copy.actions.retry}</button></div>;
  if (props.status === 'empty') return <div className="access-panel-state"><p>{props.copy.empty}</p>{props.canGoBack && <button onClick={props.onPrevious} type="button">{props.copy.previous}</button>}</div>;

  return (
    <div className="access-user-list">
      {props.page?.items.map((user) => (
        <button
          aria-pressed={props.selectedId === user.id}
          className="access-user-row"
          key={user.id}
          disabled={props.disabled}
          onClick={() => props.onSelect(user.id)}
          type="button"
        >
          <span className="access-user-avatar" aria-hidden="true">{[...user.displayName][0]?.toLocaleUpperCase()}</span>
          <span className="access-user-summary"><strong>{user.displayName}</strong><small dir="ltr">{user.email}</small></span>
          <span className={`access-status ${user.enabled ? 'is-enabled' : 'is-disabled'}`}>{user.enabled ? props.copy.enabled : props.copy.disabled}</span>
        </button>
      ))}
      <div className="access-pagination">
        <button disabled={props.disabled || !props.canGoBack} onClick={props.onPrevious} type="button">{props.copy.previous}</button>
        <button disabled={props.disabled || !props.page?.nextCursor} onClick={props.onNext} type="button">{props.copy.next}</button>
      </div>
    </div>
  );
}
