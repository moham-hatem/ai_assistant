import type { FeedbackRequest, FeedbackResponse } from '../types';
import { parseFeedbackResponse } from './feedback-parser.ts';

export type FeedbackApiErrorCode = 'invalid_response' | 'submission_failed' | 'unavailable';

export class FeedbackApiError extends Error {
  readonly code: FeedbackApiErrorCode;

  constructor(code: FeedbackApiErrorCode) {
    super(code);
    this.name = 'FeedbackApiError';
    this.code = code;
  }
}

export async function submitFeedback(input: FeedbackRequest): Promise<FeedbackResponse> {
  let response: Response;
  try {
    response = await fetch('/api/feedback', {
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  } catch {
    throw new FeedbackApiError('unavailable');
  }

  if (!response.ok) throw new FeedbackApiError('submission_failed');

  try {
    return parseFeedbackResponse(await response.json());
  } catch {
    throw new FeedbackApiError('invalid_response');
  }
}
