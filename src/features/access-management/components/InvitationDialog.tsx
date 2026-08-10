import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AuthRole } from '../../../../shared/contracts/auth';
import type { AccessCopy } from '../access-copy';
import { AccessDialog } from './AccessDialog';
import { RoleSelector } from './RoleSelector';
import { invitationUiPolicy } from '../access-policies';

interface InvitationDialogProps {
  copy: AccessCopy;
  error: string | null;
  inviting: boolean;
  onClose: () => void;
  onInvite: (input: { displayName: string; email: string; roles: AuthRole[] }) => Promise<boolean>;
  onReviewActiveInvitations: () => void;
}

export function InvitationDialog({ copy, error, inviting, onClose, onInvite, onReviewActiveInvitations }: InvitationDialogProps) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<AuthRole[]>([]);
  const [roleError, setRoleError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const policy = invitationUiPolicy(inviting);

  useEffect(() => { nameRef.current?.focus(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!roles.length) { setRoleError(true); return; }
    setRoleError(false);
    if (await onInvite({ displayName, email, roles })) onClose();
  }

  return (
    <AccessDialog closeLabel={copy.actions.close} descriptionId="invitation-description" dismissible={policy.dismissible} onClose={onClose} title={copy.invitation.title}>
      <p id="invitation-description">{copy.invitation.body}</p>
      <form aria-busy={policy.ariaBusy} className="access-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="invitation-name">{copy.displayName}</label>
        <input disabled={policy.controlsDisabled} id="invitation-name" maxLength={80} onChange={(event) => setDisplayName(event.target.value)} ref={nameRef} required value={displayName} />
        <label htmlFor="invitation-email">{copy.email}</label>
        <input autoComplete="email" dir="ltr" disabled={policy.controlsDisabled} id="invitation-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        <RoleSelector copy={copy} disabled={policy.controlsDisabled} name="invitation-role" onChange={setRoles} roles={roles} />
        {roleError && <p className="access-inline-error" role="alert">{copy.rolesRequired}</p>}
        {error && <p className="access-inline-error" role="alert">{error === 'ACCESS_OPERATION_REJECTED' ? copy.invitation.conflict : error === 'NETWORK_ERROR' ? copy.invitation.ambiguous : copy.actionError}</p>}
        {(error === 'NETWORK_ERROR' || error === 'ACCESS_OPERATION_REJECTED') && <button className="access-recovery-link" disabled={policy.controlsDisabled} onClick={onReviewActiveInvitations} type="button">{copy.activeInvitations.review}</button>}
        <div className="access-dialog-actions">
          <button className="access-secondary" disabled={policy.controlsDisabled} onClick={onClose} type="button">{copy.actions.cancel}</button>
          <button className="access-primary" disabled={policy.controlsDisabled} type="submit">{copy.actions.create}</button>
        </div>
      </form>
    </AccessDialog>
  );
}
