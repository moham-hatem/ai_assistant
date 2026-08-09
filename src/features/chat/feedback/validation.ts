import { feedbackReasons, type FeedbackReason, type FeedbackRequest } from './types.ts';

export const feedbackCommentLimit = 1_000;

export type FeedbackValidationCode =
  | 'comment_too_long'
  | 'invalid_identifier'
  | 'invalid_reason'
  | 'reason_required';

export class FeedbackValidationError extends Error {
  readonly code: FeedbackValidationCode;

  constructor(code: FeedbackValidationCode) {
    super(code);
    this.name = 'FeedbackValidationError';
    this.code = code;
  }
}

interface FeedbackDraft {
  comment: string;
  questionLogId: string;
  rating: FeedbackRequest['rating'];
  reasons: readonly FeedbackReason[];
  submissionId: string;
}

export function buildFeedbackRequest(draft: FeedbackDraft): FeedbackRequest {
  if (!draft.questionLogId.trim() || !draft.submissionId.trim()) {
    throw new FeedbackValidationError('invalid_identifier');
  }

  const comment = draft.comment.trim();
  if (comment.length > feedbackCommentLimit) {
    throw new FeedbackValidationError('comment_too_long');
  }

  const reasons = [...new Set(draft.reasons)];
  if (reasons.some((reason) => !feedbackReasons.includes(reason))) {
    throw new FeedbackValidationError('invalid_reason');
  }
  if (draft.rating === 'unhelpful' && reasons.length === 0) {
    throw new FeedbackValidationError('reason_required');
  }

  return {
    questionLogId: draft.questionLogId,
    rating: draft.rating,
    reasons: draft.rating === 'helpful' ? [] : reasons,
    ...(comment ? { comment } : {}),
    submissionId: draft.submissionId,
  };
}
