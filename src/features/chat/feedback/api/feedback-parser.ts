import type { FeedbackResponse } from '../types';

export class FeedbackResponseParseError extends Error {
  constructor() {
    super('Invalid feedback response');
    this.name = 'FeedbackResponseParseError';
  }
}

export function parseFeedbackResponse(value: unknown): FeedbackResponse {
  if (!isRecord(value) || !hasOnlyKeys(value, ['feedback', 'requestId', 'review'])) fail();
  if (!isNonEmptyRecord(value.feedback) || !isNonBlankString(value.requestId) || !isRecord(value.review)) fail();
  if (!hasOnlyKeys(value.review, ['created', 'reviewId'])) fail();

  const { created, reviewId } = value.review;
  if (typeof created !== 'boolean') fail();
  let parsedReviewId: string | null;
  if (reviewId === null) {
    if (created) fail();
    parsedReviewId = null;
  } else {
    if (!isNonBlankString(reviewId)) fail();
    parsedReviewId = reviewId;
  }

  return {
    feedback: value.feedback,
    requestId: value.requestId,
    review: { created, reviewId: parsedReviewId },
  };
}

function fail(): never {
  throw new FeedbackResponseParseError();
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}
