import { createHash } from 'node:crypto';
import type { SubmitFeedbackInput } from '../../../shared/contracts/feedback.ts';

export function digestSubmissionId(submissionId: string): string {
  return sha256(submissionId.toLowerCase());
}

export function digestFeedbackPayload(input: Omit<SubmitFeedbackInput, 'submissionId'>): string {
  return sha256(JSON.stringify({
    comment: input.comment ?? null,
    questionLogId: input.questionLogId,
    rating: input.rating,
    reasons: [...input.reasons].sort(),
  }));
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
