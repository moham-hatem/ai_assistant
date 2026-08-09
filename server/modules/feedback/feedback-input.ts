import {
  feedbackRatings,
  feedbackReasons,
  type FeedbackListQuery,
  type FeedbackRating,
  type FeedbackReason,
  type FeedbackReviewStatus,
  type SubmitFeedbackInput,
} from '../../../shared/contracts/feedback.ts';
import { reviewStatuses, type ReviewStatus } from '../../../shared/contracts/reviews.ts';
import { AppError } from '../../errors.ts';
import { MAXIMUM_FEEDBACK_COMMENT_LENGTH } from './feedback-domain.ts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const defaultLimit = 25;
const maximumLimit = 100;
const maximumOffset = 1_000_000;

export function parseSubmitFeedback(value: unknown): SubmitFeedbackInput {
  const body = objectBody(value, ['comment', 'questionLogId', 'rating', 'reasons', 'submissionId']);
  const rating = parseRating(body.rating);
  const reasons = parseReasons(body.reasons);
  if (rating === 'helpful' && reasons.length !== 0) invalid('Helpful feedback does not accept reasons.');
  if (rating === 'unhelpful' && reasons.length === 0) invalid('Unhelpful feedback requires a reason.');
  const comment = optionalComment(body.comment);
  return {
    ...(comment === undefined ? {} : { comment }),
    questionLogId: validId(body.questionLogId),
    rating,
    reasons,
    submissionId: validId(body.submissionId),
  };
}

export function parseFeedbackList(url: URL): FeedbackListQuery {
  const allowed = new Set([
    'channel', 'language', 'limit', 'offset', 'rating', 'reason', 'reviewStatus',
  ]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      invalid('Invalid feedback filter.');
    }
  }
  const rating = url.searchParams.get('rating');
  const reason = url.searchParams.get('reason');
  const reviewStatus = url.searchParams.get('reviewStatus');
  return {
    channel: optionalQueryString(url, 'channel'),
    language: optionalQueryString(url, 'language'),
    limit: parseInteger(url.searchParams.get('limit'), defaultLimit, maximumLimit, 1),
    offset: parseInteger(url.searchParams.get('offset'), 0, maximumOffset),
    rating: rating === null ? undefined : parseRating(rating),
    reason: reason === null ? undefined : parseReason(reason),
    reviewStatus: reviewStatus === null ? undefined : parseReviewStatus(reviewStatus),
  };
}

export function validFeedbackId(value: string): string {
  try {
    return validId(decodeURIComponent(value));
  } catch (error) {
    if (error instanceof AppError) throw error;
    return invalid('Resource id is invalid.');
  }
}

function parseRating(value: unknown): FeedbackRating {
  if (typeof value !== 'string' || !feedbackRatings.includes(value as FeedbackRating)) {
    invalid('rating is not recognized.');
  }
  return value as FeedbackRating;
}

function parseReasons(value: unknown): FeedbackReason[] {
  if (!Array.isArray(value)) invalid('reasons must be an array.');
  const reasons = value.map(parseReason);
  if (new Set(reasons).size !== reasons.length) invalid('reasons must be unique.');
  return feedbackReasons.filter((reason) => reasons.includes(reason));
}

function parseReason(value: unknown): FeedbackReason {
  if (typeof value !== 'string' || !feedbackReasons.includes(value as FeedbackReason)) {
    invalid('reason is not recognized.');
  }
  return value as FeedbackReason;
}

function parseReviewStatus(value: string): FeedbackReviewStatus {
  if (value === 'none') return value;
  if (!reviewStatuses.includes(value as ReviewStatus)) invalid('reviewStatus is not recognized.');
  return value as ReviewStatus;
}

function objectBody(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('A JSON object is required.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    invalid('Request contains an unknown field.');
  }
  return body;
}

function optionalComment(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid('comment must be a string.');
  const comment = value.trim();
  if (comment.length > MAXIMUM_FEEDBACK_COMMENT_LENGTH) invalid('comment is too long.');
  return comment || undefined;
}

function optionalQueryString(url: URL, field: string): string | undefined {
  const value = url.searchParams.get(field);
  if (value === null) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) invalid(`${field} has an invalid length.`);
  return normalized;
}

function parseInteger(value: string | null, fallback: number, maximum: number, minimum = 0): number {
  if (value === null) return fallback;
  if (!/^\d+$/u.test(value)) invalid('Pagination values must be integers.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    invalid('Pagination value is outside the supported range.');
  }
  return parsed;
}

function validId(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid('Resource id is invalid.');
  return value.toLowerCase();
}

function invalid(message: string): never {
  throw new AppError('INVALID_REQUEST', message, 400);
}
