import {
  reviewDecisionOutcomes,
  reviewStatuses,
  type ReviewDecisionOutcome,
  type ReviewListQuery,
  type ReviewStatus,
} from '../../../shared/contracts/reviews.ts';
import { AppError } from '../../errors.ts';
import type { SaveDecisionInput } from './review-service.ts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const defaultLimit = 25;
const maximumLimit = 100;
const maximumOffset = 1_000_000;

export function parseCreateReview(value: unknown): { questionLogId: string } {
  const body = objectBody(value, ['questionLogId']);
  return { questionLogId: validId(body.questionLogId) };
}

export function parseStatusChange(value: unknown): { reviewerId: string; status: ReviewStatus } {
  const body = objectBody(value, ['reviewerId', 'status']);
  const status = body.status;
  if (typeof status !== 'string' || !reviewStatuses.includes(status as ReviewStatus)) {
    invalid('status is not a recognized review status.');
  }
  return {
    reviewerId: requiredString(body.reviewerId, 'reviewerId', 200),
    status: status as ReviewStatus,
  };
}

export function parseDecision(value: unknown): SaveDecisionInput {
  const body = objectBody(value, [
    'correctedAnswer',
    'internalNotes',
    'outcome',
    'reviewerId',
  ]);
  const outcome = body.outcome;
  if (
    typeof outcome !== 'string'
    || !reviewDecisionOutcomes.includes(outcome as ReviewDecisionOutcome)
  ) invalid('outcome is not a recognized review decision.');
  return {
    correctedAnswer: optionalString(body.correctedAnswer, 'correctedAnswer', 20_000),
    internalNotes: optionalString(body.internalNotes, 'internalNotes', 4_000),
    outcome: outcome as ReviewDecisionOutcome,
    reviewerId: requiredString(body.reviewerId, 'reviewerId', 200),
  };
}

export function parseReviewList(url: URL): ReviewListQuery {
  const allowed = new Set(['answerLanguage', 'channel', 'limit', 'offset', 'reviewerId', 'status']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) invalid('Invalid review filter.');
  }
  const status = url.searchParams.get('status');
  if (status !== null && !reviewStatuses.includes(status as ReviewStatus)) {
    invalid('status is not a recognized review status.');
  }
  return {
    answerLanguage: optionalQueryString(url, 'answerLanguage'),
    channel: optionalQueryString(url, 'channel'),
    limit: parseInteger(url.searchParams.get('limit'), defaultLimit, maximumLimit, 1),
    offset: parseInteger(url.searchParams.get('offset'), 0, maximumOffset),
    reviewerId: optionalQueryString(url, 'reviewerId'),
    status: status === null ? undefined : status as ReviewStatus,
  };
}

export function validReviewId(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return invalid('Resource id is invalid.');
  }
  return validId(decoded);
}

function objectBody(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('A JSON object is required.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowed.includes(key))) invalid('Request contains an unknown field.');
  return body;
}

function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') invalid(`${field} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) invalid(`${field} has an invalid length.`);
  return normalized;
}

function optionalString(value: unknown, field: string, maximum: number): string | undefined {
  return value === undefined ? undefined : requiredString(value, field, maximum);
}

function optionalQueryString(url: URL, field: string): string | undefined {
  const value = url.searchParams.get(field);
  return value === null ? undefined : requiredString(value, field, 200);
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
  return value;
}

function invalid(message: string): never {
  throw new AppError('INVALID_REQUEST', message, 400);
}
