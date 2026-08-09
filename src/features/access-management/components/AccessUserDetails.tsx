import { useEffect, useState, type FormEvent } from 'react';
import type { AccessUserDetails as AccessUser } from '../../../../shared/contracts/access-management';
import type { AuthRole } from '../../../../shared/contracts/auth';
import type { AccessCopy } from '../access-copy';
import type { LoadStatus } from '../access-state';
import type { AccessAction } from '../hooks/useAccessManagement';
import { RoleSelector } from './RoleSelector';

interface AccessUserDetailsProps {
  actionError: string | null;
  actionSuccess: AccessAction | null;
  busy: AccessAction | null;
  copy: AccessCopy;
  onConfirm: (action: 'enable' | 'disable' | 'sessions') => void;
  onRecovery: (id: string) => void;
  onRetry: (id: string) => void;
  onSave: (id: string, update: { displayName: string; roles: AuthRole[] }) => void;
  selectedId: string | null;
  status: LoadStatus;
  user: AccessUser | null;
}

export function AccessUserDetails(props: AccessUserDetailsProps) {
  const [displayName, setDisplayName] = useState('');
  const [roles, setRoles] = useState<AuthRole[]>([]);
  const [roleError, setRoleError] = useState(false);

  useEffect(() => {
    if (props.user) {
      setDisplayName(props.user.displayName);
      setRoles(props.user.roles);
      setRoleError(false);
    }
  }, [props.user]);

  if (!props.selectedId) return <div className="access-detail-empty">{props.copy.noSelection}</div>;
  if (props.status === 'loading') return <div className="access-panel-state" role="status">{props.copy.loading}</div>;
  if (props.status === 'error' || !props.user) return <div className="access-panel-state" role="alert"><p>{props.copy.userError}</p><button onClick={() => props.onRetry(props.selectedId!)} type="button">{props.copy.actions.retry}</button></div>;

  const user = props.user;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!roles.length) { setRoleError(true); return; }
    setRoleError(false);
    props.onSave(user.id, { displayName, roles });
  }

  return (
    <article className="access-user-detail">
      <div className="access-detail-heading"><div><span>{props.copy.details}</span><h2>{user.displayName}</h2><p dir="ltr">{user.email}</p></div><span className={`access-status ${user.enabled ? 'is-enabled' : 'is-disabled'}`}>{user.enabled ? props.copy.enabled : props.copy.disabled}</span></div>
      <form className="access-form" onSubmit={submit}>
        <label htmlFor="access-display-name">{props.copy.displayName}</label>
        <input disabled={props.busy !== null} id="access-display-name" maxLength={80} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
        <RoleSelector copy={props.copy} disabled={props.busy !== null} name="access-user-role" onChange={setRoles} roles={roles} />
        {roleError && <p className="access-inline-error" role="alert">{props.copy.rolesRequired}</p>}
        {props.actionError && <p className="access-inline-error" role="alert">{props.copy.actionError}</p>}
        {props.actionSuccess && props.actionSuccess !== 'recovery' && <p className="access-success" role="status">{props.copy.actionSuccess[props.actionSuccess]}</p>}
        <button className="access-primary" disabled={props.busy !== null} type="submit">{props.copy.actions.save}</button>
      </form>
      <dl className="access-user-meta"><div><dt>{props.copy.created}</dt><dd><time dateTime={user.createdAt}>{new Date(user.createdAt).toLocaleString()}</time></dd></div><div><dt>{props.copy.updated}</dt><dd><time dateTime={user.updatedAt}>{new Date(user.updatedAt).toLocaleString()}</time></dd></div></dl>
      <div className="access-account-actions">
        <button className={user.enabled ? 'access-danger-outline' : 'access-secondary'} disabled={props.busy !== null} onClick={() => props.onConfirm(user.enabled ? 'disable' : 'enable')} type="button">{user.enabled ? props.copy.disabled : props.copy.enabled}</button>
        <button className="access-secondary" disabled={props.busy !== null} onClick={() => props.onConfirm('sessions')} type="button">{props.copy.sessions}</button>
        <button className="access-secondary" disabled={props.busy !== null} onClick={() => props.onRecovery(user.id)} type="button">{props.copy.recovery.create}</button>
      </div>
    </article>
  );
}
