import type { AccessCopy } from '../access-copy';
import type { AccessAction } from '../hooks/useAccessManagement';
import { AccessDialog } from './AccessDialog';

interface ConfirmActionDialogProps {
  action: 'enable' | 'disable' | 'sessions';
  busy: AccessAction | null;
  copy: AccessCopy;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmActionDialog({ action, busy, copy, onClose, onConfirm }: ConfirmActionDialogProps) {
  const title = action === 'sessions' ? copy.sessions : action === 'enable' ? copy.enabled : copy.disabled;
  return (
    <AccessDialog closeLabel={copy.actions.close} descriptionId="confirm-access-action" onClose={onClose} title={title}>
      <p id="confirm-access-action">{copy.confirm[action]}</p>
      <div className="access-dialog-actions">
        <button className="access-secondary" disabled={busy !== null} onClick={onClose} type="button">{copy.actions.cancel}</button>
        <button className={action === 'enable' ? 'access-primary' : 'access-danger'} disabled={busy !== null} onClick={onConfirm} type="button">{title}</button>
      </div>
    </AccessDialog>
  );
}
