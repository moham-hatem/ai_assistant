import { useRef } from 'react';
import type { ActiveInvitation } from '../active-invitation';
import type { AccessCopy } from '../access-copy';
import { AccessDialog } from './AccessDialog';

interface CancelInvitationDialogProps {
  busy: boolean;
  copy: AccessCopy;
  invitation: ActiveInvitation;
  onAfterClose?: () => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function CancelInvitationDialog(props: CancelInvitationDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AccessDialog closeLabel={props.copy.actions.close} descriptionId="cancel-invitation-description" dismissible={!props.busy} initialFocusRef={cancelRef} onAfterClose={props.onAfterClose} onClose={props.onClose} title={props.copy.activeInvitations.cancelTitle}>
      <p id="cancel-invitation-description">{props.copy.activeInvitations.cancelBody}</p>
      <p className="access-dialog-identity" dir="ltr">{props.invitation.email}</p>
      <div aria-busy={props.busy} className="access-dialog-actions">
        <button className="access-secondary" disabled={props.busy} onClick={props.onClose} ref={cancelRef} type="button">{props.copy.actions.cancel}</button>
        <button className="access-danger" disabled={props.busy} onClick={props.onConfirm} type="button">{props.copy.activeInvitations.cancel}</button>
      </div>
    </AccessDialog>
  );
}
