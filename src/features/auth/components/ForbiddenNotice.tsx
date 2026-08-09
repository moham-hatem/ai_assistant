import { ShieldAlert, X } from 'lucide-react';
import type { AuthCopy } from '../copy';

export function ForbiddenNotice({ copy, onClose }: { copy: AuthCopy; onClose: () => void }) {
  return <div className="admin-forbidden" role="alert"><ShieldAlert size={19} /><div><strong>{copy.forbidden}</strong><p>{copy.forbiddenBody}</p></div><button aria-label={copy.close} onClick={onClose} type="button"><X size={17} /></button></div>;
}
