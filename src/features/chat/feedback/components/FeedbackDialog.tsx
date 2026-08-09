import { useEffect, useId, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { FeedbackCopy } from '../copy';
import type { FeedbackState } from '../feedback-state';
import { feedbackReasons, type FeedbackReason } from '../types';
import { feedbackCommentLimit } from '../validation';

interface FeedbackDialogProps {
  copy: FeedbackCopy;
  onChangeComment: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onToggleReason: (reason: FeedbackReason) => void;
  state: FeedbackState;
}

export function FeedbackDialog(props: FeedbackDialogProps) {
  const { copy, onChangeComment, onClose, onSubmit, onToggleReason, state } = props;
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const reasonHintId = useId();
  const busy = state.phase === 'submitting';
  const lockedForRetry = state.phase === 'error';

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>('input, button, textarea')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (state.reasons.length > 0) void onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return createPortal(
    <div
      className="feedback-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        aria-busy={busy}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="feedback-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <h2 id={titleId}>{copy.dialogTitle}</h2>
            <p id={descriptionId}>{copy.dialogDescription}</p>
          </div>
          <button aria-label={copy.close} disabled={busy} onClick={onClose} type="button">
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <fieldset aria-describedby={reasonHintId} disabled={busy || lockedForRetry}>
            <legend>{copy.reasonRequired}</legend>
            <span className="feedback-field-hint" id={reasonHintId}>{copy.dialogDescription}</span>
            <div className="feedback-reasons">
              {feedbackReasons.map((reason) => {
                const inputId = `${titleId}-${reason}`;
                return (
                  <label htmlFor={inputId} key={reason}>
                    <input
                      checked={state.reasons.includes(reason)}
                      id={inputId}
                      onChange={() => onToggleReason(reason)}
                      type="checkbox"
                    />
                    <span>{copy.reasons[reason]}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className="feedback-comment">
            <span>{copy.commentLabel}</span>
            <textarea
              dir="auto"
              disabled={busy || lockedForRetry}
              maxLength={feedbackCommentLimit}
              onChange={(event) => onChangeComment(event.target.value)}
              placeholder={copy.commentPlaceholder}
              rows={4}
              value={state.comment}
            />
            <small>{copy.commentHint}</small>
          </label>
          {state.phase === 'error' && state.errorCode && (
            <p className="feedback-error" role="alert">
              <AlertCircle aria-hidden="true" size={18} />{copy.error[state.errorCode]}
            </p>
          )}
          <footer>
            <button disabled={busy} onClick={onClose} type="button">{copy.cancel}</button>
            <button disabled={busy || state.reasons.length === 0} type="submit">
              {busy ? copy.submitting : state.phase === 'error' ? copy.retry : copy.submitReport}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
