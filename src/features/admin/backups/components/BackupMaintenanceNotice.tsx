import { ShieldAlert } from 'lucide-react';
import type { BackupsCopy } from '../copy';

export function BackupMaintenanceNotice({ copy }: { copy: BackupsCopy }) {
  return <aside className="backups-maintenance-notice" role="note">
    <ShieldAlert aria-hidden="true" size={24} />
    <div><h2>{copy.maintenanceTitle}</h2><p>{copy.maintenanceBody}</p></div>
  </aside>;
}
