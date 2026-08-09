import type { FeedbackReason } from '../../../shared/contracts/feedback.ts';

export const MAXIMUM_FEEDBACK_COMMENT_LENGTH = 1_000;
export const UNHELPFUL_REVIEW_THRESHOLD = 3;

export function isHighRiskFeedback(reasons: readonly FeedbackReason[]): boolean {
  return reasons.includes('harmful_or_sensitive');
}
