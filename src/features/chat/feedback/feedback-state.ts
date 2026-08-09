import type { FeedbackApiErrorCode } from './api/submit-feedback';
import type { FeedbackRating, FeedbackReason } from './types';

export type FeedbackPhase =
  | 'confirming_helpful'
  | 'editing'
  | 'error'
  | 'idle'
  | 'submitting'
  | 'success';

export interface FeedbackState {
  comment: string;
  errorCode: FeedbackApiErrorCode | null;
  phase: FeedbackPhase;
  rating: FeedbackRating | null;
  reasons: FeedbackReason[];
  requestToken: number | null;
  reviewRouted: boolean | null;
  submissionId: string | null;
}

export type FeedbackAction =
  | { type: 'comment_changed'; value: string }
  | { type: 'dismissed' }
  | { rating: FeedbackRating; submissionId: string; type: 'opened' }
  | { reason: FeedbackReason; type: 'reason_toggled' }
  | { type: 'reset' }
  | { requestToken: number; type: 'submit_started' }
  | { errorCode: FeedbackApiErrorCode; requestToken: number; type: 'submit_failed' }
  | { requestToken: number; reviewRouted: boolean; type: 'submit_succeeded' };

export function createFeedbackState(): FeedbackState {
  return {
    comment: '',
    errorCode: null,
    phase: 'idle',
    rating: null,
    reasons: [],
    requestToken: null,
    reviewRouted: null,
    submissionId: null,
  };
}

export function feedbackReducer(state: FeedbackState, action: FeedbackAction): FeedbackState {
  switch (action.type) {
    case 'opened':
      if (state.phase !== 'idle') return state;
      return {
        ...createFeedbackState(),
        phase: action.rating === 'helpful' ? 'confirming_helpful' : 'editing',
        rating: action.rating,
        submissionId: action.submissionId,
      };
    case 'dismissed':
      return state.phase === 'submitting' || state.phase === 'success'
        ? state
        : createFeedbackState();
    case 'reason_toggled':
      if (state.phase !== 'editing' || state.rating !== 'unhelpful') return state;
      return {
        ...state,
        reasons: state.reasons.includes(action.reason)
          ? state.reasons.filter((reason) => reason !== action.reason)
          : [...state.reasons, action.reason],
      };
    case 'comment_changed':
      return state.phase === 'editing' ? { ...state, comment: action.value } : state;
    case 'submit_started':
      if (!['confirming_helpful', 'editing', 'error'].includes(state.phase)) return state;
      return { ...state, errorCode: null, phase: 'submitting', requestToken: action.requestToken };
    case 'submit_succeeded':
      if (state.phase !== 'submitting' || state.requestToken !== action.requestToken) return state;
      return {
        ...state,
        phase: 'success',
        requestToken: null,
        reviewRouted: action.reviewRouted,
      };
    case 'submit_failed':
      if (state.phase !== 'submitting' || state.requestToken !== action.requestToken) return state;
      return { ...state, errorCode: action.errorCode, phase: 'error', requestToken: null };
    case 'reset':
      return createFeedbackState();
  }
}
