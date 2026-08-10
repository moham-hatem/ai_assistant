import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';

interface AccessDialogProps {
  children: ReactNode;
  closeLabel: string;
  descriptionId?: string;
  dismissible?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onAfterClose?: () => void;
  onClose: () => void;
  title: string;
}

export function AccessDialog({ children, closeLabel, descriptionId, dismissible = true, initialFocusRef, onAfterClose, onClose, title }: AccessDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const afterCloseRef = useRef(onAfterClose);
  const initialFocus = useRef(initialFocusRef);
  const titleId = useId();
  afterCloseRef.current = onAfterClose;
  initialFocus.current = initialFocusRef;

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    initialFocus.current?.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      queueMicrotask(() => {
        if (trigger?.isConnected && !document.querySelector('dialog[open]')) trigger.focus();
        afterCloseRef.current?.();
      });
    };
  }, []);

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="access-dialog"
      onCancel={(event) => { event.preventDefault(); if (dismissible) onClose(); }}
      ref={dialogRef}
    >
      <div className="access-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button aria-label={closeLabel} disabled={!dismissible} onClick={onClose} type="button"><X size={19} /></button>
      </div>
      {children}
    </dialog>
  );
}
