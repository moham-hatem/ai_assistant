import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface AccessDialogProps {
  children: ReactNode;
  closeLabel: string;
  descriptionId?: string;
  onClose: () => void;
  title: string;
}

export function AccessDialog({ children, closeLabel, descriptionId, onClose, title }: AccessDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `access-dialog-${useIdSafe(title)}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="access-dialog"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      ref={dialogRef}
    >
      <div className="access-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button aria-label={closeLabel} onClick={onClose} type="button"><X size={19} /></button>
      </div>
      {children}
    </dialog>
  );
}

function useIdSafe(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/giu, '-').slice(0, 32) || 'title';
}
