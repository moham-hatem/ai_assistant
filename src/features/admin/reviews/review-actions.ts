import type { DecisionMode, ReviewDecisionRequest } from './types';

const MAX_REVIEWER_LENGTH = 200;
const MAX_NOTES_LENGTH = 4_000;
const MAX_CORRECTION_LENGTH = 20_000;
const MAX_REQUEST_BYTES = 16_384;

export type ReviewActionValidationCode =
  | 'correction_required'
  | 'correction_too_long'
  | 'notes_required'
  | 'notes_too_long'
  | 'request_too_large'
  | 'reviewer_required'
  | 'reviewer_too_long';

export class ReviewActionValidationError extends Error {
  readonly code: ReviewActionValidationCode;

  constructor(code: ReviewActionValidationCode) {
    super(code);
    this.name = 'ReviewActionValidationError';
    this.code = code;
  }
}

export function buildDecisionRequest(input: {
  correctedAnswer: string;
  internalNotes: string;
  mode: DecisionMode;
  reviewerId: string;
}): ReviewDecisionRequest {
  const reviewerId = validateReviewerId(input.reviewerId);
  const internalNotes = optionalText(input.internalNotes, MAX_NOTES_LENGTH, 'notes_too_long');
  let request: ReviewDecisionRequest;

  if (input.mode === 'approve_edited') {
    const correctedAnswer = requiredText(
      input.correctedAnswer,
      MAX_CORRECTION_LENGTH,
      'correction_required',
      'correction_too_long',
    );
    request = { correctedAnswer, outcome: 'approved', reviewerId };
  } else if (input.mode === 'needs_changes') {
    request = {
      internalNotes: requiredText(
        input.internalNotes,
        MAX_NOTES_LENGTH,
        'notes_required',
        'notes_too_long',
      ),
      outcome: 'needs_changes',
      reviewerId,
    };
  } else {
    request = { outcome: input.mode === 'approve_as_is' ? 'approved' : 'rejected', reviewerId };
  }

  if (internalNotes && input.mode !== 'needs_changes') request.internalNotes = internalNotes;
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MAX_REQUEST_BYTES) {
    throw new ReviewActionValidationError('request_too_large');
  }
  return request;
}

export function validateReviewerId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ReviewActionValidationError('reviewer_required');
  if (normalized.length > MAX_REVIEWER_LENGTH) {
    throw new ReviewActionValidationError('reviewer_too_long');
  }
  return normalized;
}

function optionalText(
  value: string,
  maximum: number,
  tooLong: ReviewActionValidationCode,
): string | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maximum) throw new ReviewActionValidationError(tooLong);
  return normalized;
}

function requiredText(
  value: string,
  maximum: number,
  required: ReviewActionValidationCode,
  tooLong: ReviewActionValidationCode,
): string {
  return optionalText(value, maximum, tooLong) ?? (() => {
    throw new ReviewActionValidationError(required);
  })();
}
