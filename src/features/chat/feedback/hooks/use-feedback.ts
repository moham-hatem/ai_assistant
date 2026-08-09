import { useEffect, useReducer, useRef } from 'react';
import { createFeedbackState, feedbackReducer } from '../feedback-state';
import { createFeedbackSubmission } from '../feedback-submission';
import { createFeedbackAttempt } from '../feedback-attempt';
import type { FeedbackRating, FeedbackReason } from '../types';
import { buildFeedbackRequest, FeedbackValidationError } from '../validation';

export function useFeedback(questionLogId: string) {
  const [state, dispatch] = useReducer(feedbackReducer, undefined, createFeedbackState);
  const attemptRef = useRef<ReturnType<typeof createFeedbackAttempt> | null>(null);
  const submissionRef = useRef<ReturnType<typeof createFeedbackSubmission> | null>(null);
  attemptRef.current ??= createFeedbackAttempt();
  if (!submissionRef.current) {
    submissionRef.current = createFeedbackSubmission((event) => {
      if (event.type === 'started') dispatch({ requestToken: event.requestToken, type: 'submit_started' });
      if (event.type === 'failed') dispatch({
        errorCode: event.errorCode,
        requestToken: event.requestToken,
        type: 'submit_failed',
      });
      if (event.type === 'succeeded') dispatch({
        requestToken: event.requestToken,
        reviewRouted: event.reviewRouted,
        type: 'submit_succeeded',
      });
    });
  }

  useEffect(() => {
    const submission = submissionRef.current;
    attemptRef.current?.reset();
    submission?.reset();
    dispatch({ type: 'reset' });
    return () => submission?.reset();
  }, [questionLogId]);

  function open(rating: FeedbackRating) {
    const submissionId = attemptRef.current?.open();
    if (!submissionId) return;
    submissionRef.current?.reset();
    dispatch({ rating, submissionId, type: 'opened' });
  }

  function submit() {
    if (state.phase === 'error') {
      submissionRef.current?.retry();
      return;
    }
    if (!state.rating || !state.submissionId) return;

    let request;
    try {
      request = buildFeedbackRequest({
        comment: state.comment,
        questionLogId,
        rating: state.rating,
        reasons: state.reasons,
        submissionId: state.submissionId,
      });
    } catch (error) {
      if (error instanceof FeedbackValidationError) return;
      throw error;
    }

    submissionRef.current?.submit(request);
  }

  return {
    changeComment: (value: string) => dispatch({ type: 'comment_changed', value }),
    close: () => {
      attemptRef.current?.reset();
      submissionRef.current?.reset();
      dispatch({ type: 'dismissed' });
    },
    open,
    state,
    submit,
    toggleReason: (reason: FeedbackReason) => dispatch({ reason, type: 'reason_toggled' }),
  };
}
