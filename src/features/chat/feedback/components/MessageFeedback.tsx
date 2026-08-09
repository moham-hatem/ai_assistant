import { useEffect, useId, useRef } from 'react';
import { Check, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { FeedbackCopy } from '../copy';
import { useFeedback } from '../hooks/use-feedback';
import { FeedbackDialog } from './FeedbackDialog';

interface MessageFeedbackProps {
  copy: FeedbackCopy;
  questionLogId: string;
}

export function MessageFeedback({ copy, questionLogId }: MessageFeedbackProps) {
  const { changeComment, close, open, state, submit, toggleReason } = useFeedback(questionLogId);
  const promptId = useId();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const helpfulButtonRef = useRef<HTMLButtonElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const unhelpfulButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state.phase === 'confirming_helpful') confirmButtonRef.current?.focus();
    if (state.phase === 'success') successRef.current?.focus();
  }, [state.phase]);

  function cancelHelpful() {
    close();
    requestAnimationFrame(() => helpfulButtonRef.current?.focus());
  }

  function closeDialog() {
    close();
    requestAnimationFrame(() => unhelpfulButtonRef.current?.focus());
  }

  if (state.phase === 'success') {
    return (
      <div className="feedback-result" ref={successRef} role="status" tabIndex={-1}>
        <Check aria-hidden="true" size={18} />
        <span>{copy.success} {state.reviewRouted ? copy.reviewRouted : copy.reviewNotCreated}</span>
      </div>
    );
  }

  const helpfulError = state.phase === 'error' && state.rating === 'helpful';
  return (
    <div className="message-feedback">
      {state.phase === 'idle' && (
        <div aria-labelledby={promptId} className="feedback-actions" role="group">
          <span id={promptId}>{copy.prompt}</span>
          <button onClick={() => open('helpful')} ref={helpfulButtonRef} type="button">
            <ThumbsUp aria-hidden="true" size={17} />{copy.helpful}
          </button>
          <button onClick={() => open('unhelpful')} ref={unhelpfulButtonRef} type="button">
            <ThumbsDown aria-hidden="true" size={17} />{copy.unhelpful}
          </button>
        </div>
      )}
      {(state.phase === 'confirming_helpful' || (state.phase === 'submitting' && state.rating === 'helpful')) && (
        <div
          className="feedback-helpful-confirm"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && state.phase !== 'submitting') cancelHelpful();
          }}
        >
          <span>{copy.confirmHelpful}</span>
          <button disabled={state.phase === 'submitting'} onClick={() => void submit()} ref={confirmButtonRef} type="button">
            {state.phase === 'submitting' ? copy.submitting : copy.confirmHelpfulAction}
          </button>
          <button disabled={state.phase === 'submitting'} onClick={cancelHelpful} type="button">{copy.cancel}</button>
        </div>
      )}
      {helpfulError && state.errorCode && (
        <div className="feedback-inline-error" role="alert">
          <span>{copy.error[state.errorCode]}</span>
          <button onClick={() => void submit()} type="button">{copy.retry}</button>
          <button onClick={cancelHelpful} type="button">{copy.cancel}</button>
        </div>
      )}
      {state.rating === 'unhelpful' && ['editing', 'error', 'submitting'].includes(state.phase) && (
        <FeedbackDialog
          copy={copy}
          onChangeComment={changeComment}
          onClose={closeDialog}
          onSubmit={submit}
          onToggleReason={toggleReason}
          state={state}
        />
      )}
    </div>
  );
}
