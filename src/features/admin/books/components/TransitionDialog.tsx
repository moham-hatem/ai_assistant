import { AlertCircle, X } from 'lucide-react';
import type { BooksCopy } from '../copy';
import type { PendingTransition } from '../types';

interface TransitionDialogProps {
  busy: boolean;
  copy: BooksCopy;
  onCancel: () => void;
  onConfirm: () => void;
  pending: PendingTransition;
}

export function TransitionDialog({ busy, copy, onCancel, onConfirm, pending }: TransitionDialogProps) {
  const action = copy.actions[pending.targetStatus];
  return (
    <div className="books-dialog-backdrop" onMouseDown={() => { if (!busy) onCancel(); }} role="presentation">
      <section aria-modal="true" className="books-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header><span><AlertCircle size={21} /></span><div><small>{copy.statuses[pending.edition.status]} → {copy.statuses[pending.targetStatus]}</small><h2>{copy.confirmTitle}</h2></div><button aria-label={copy.cancel} disabled={busy} onClick={onCancel} type="button"><X size={18} /></button></header>
        <p>{copy.confirmBody(pending.edition.version, action)}</p>
        <footer><button className="books-secondary-button" disabled={busy} onClick={onCancel} type="button">{copy.cancel}</button><button className="books-confirm-button" disabled={busy} onClick={onConfirm} type="button">{busy ? copy.confirming : copy.confirm}</button></footer>
      </section>
    </div>
  );
}
