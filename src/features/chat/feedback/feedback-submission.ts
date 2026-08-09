import { FeedbackApiError, submitFeedback } from './api/submit-feedback.ts';
import type { FeedbackRequest, FeedbackResponse } from './types';

export type FeedbackSubmissionEvent =
  | { requestToken: number; type: 'started' }
  | { errorCode: FeedbackApiError['code']; requestToken: number; type: 'failed' }
  | { requestToken: number; reviewRouted: boolean; type: 'succeeded' };

type FeedbackTransport = (request: FeedbackRequest) => Promise<FeedbackResponse>;

export function createFeedbackSubmission(
  onEvent: (event: FeedbackSubmissionEvent) => void,
  transport: FeedbackTransport = submitFeedback,
) {
  let completed = false;
  let inFlight = false;
  let requestToken = 0;
  let snapshot: FeedbackRequest | null = null;

  function start(request?: FeedbackRequest): boolean {
    if (completed || inFlight || (!request && !snapshot)) return false;
    snapshot ??= cloneRequest(request!);
    const payload = snapshot;
    const token = ++requestToken;
    inFlight = true;
    onEvent({ requestToken: token, type: 'started' });
    void transport(payload).then(
      (response) => {
        if (token !== requestToken) return;
        completed = true;
        onEvent({
          requestToken: token,
          reviewRouted: response.review.reviewId !== null,
          type: 'succeeded',
        });
      },
      (error: unknown) => {
        if (token !== requestToken) return;
        onEvent({
          errorCode: error instanceof FeedbackApiError ? error.code : 'submission_failed',
          requestToken: token,
          type: 'failed',
        });
      },
    ).finally(() => {
      if (token === requestToken) inFlight = false;
    });
    return true;
  }

  return {
    reset() {
      requestToken += 1;
      completed = false;
      inFlight = false;
      snapshot = null;
    },
    retry: () => start(),
    submit: (request: FeedbackRequest) => start(request),
  };
}

function cloneRequest(request: FeedbackRequest): FeedbackRequest {
  return {
    ...request,
    reasons: [...request.reasons],
  };
}
