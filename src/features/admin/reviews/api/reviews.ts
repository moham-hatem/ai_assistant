import type {
  ReviewDecisionRequest,
  ReviewDetail,
  ReviewItem,
  ReviewListRequest,
  ReviewPage,
  ReviewStatusRequest,
} from '../types';
import { ReviewsApiError } from './review-api-error.ts';
import {
  parseReviewDetailResponse,
  parseReviewItemResponse,
  parseReviewPage,
} from './review-parser.ts';
import { adminFetch } from '../../api/admin-fetch.ts';

export { ReviewsApiError } from './review-api-error.ts';

export async function fetchReviewPage(
  request: ReviewListRequest,
  signal?: AbortSignal,
): Promise<ReviewPage> {
  const query = new URLSearchParams({ limit: String(request.limit), offset: String(request.offset) });
  appendFilter(query, 'status', request.status);
  appendFilter(query, 'answerLanguage', request.answerLanguage);
  appendFilter(query, 'channel', request.channel);
  appendFilter(query, 'reviewerId', request.reviewerId);
  const response = await adminFetch(`/api/internal/reviews?${query}`, { signal });
  return parseReviewPage(await readJson(response));
}

export async function fetchReview(id: string, signal?: AbortSignal): Promise<ReviewDetail> {
  const response = await adminFetch(`/api/internal/reviews/${encodeURIComponent(id)}`, { signal });
  return parseReviewDetailResponse(await readJson(response));
}

export async function changeReviewStatus(
  id: string,
  request: ReviewStatusRequest,
): Promise<ReviewItem> {
  const response = await postJson(`/api/internal/reviews/${encodeURIComponent(id)}/status`, request);
  return parseReviewItemResponse(await readJson(response));
}

export async function saveReviewDecision(
  id: string,
  request: ReviewDecisionRequest,
): Promise<ReviewDetail> {
  const response = await postJson(`/api/internal/reviews/${encodeURIComponent(id)}/decision`, request);
  return parseReviewDetailResponse(await readJson(response));
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return adminFetch(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

async function readJson(response: Response): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ReviewsApiError('Review API returned invalid JSON.', { status: response.status });
  }
  if (!response.ok) {
    const body = isObject(payload) ? payload : {};
    throw new ReviewsApiError(
      typeof body.message === 'string' ? body.message : 'Review request failed.',
      {
        code: typeof body.code === 'string' ? body.code : 'REQUEST_FAILED',
        requestId: typeof body.requestId === 'string' ? body.requestId : null,
        status: response.status,
      },
    );
  }
  return payload;
}

function appendFilter(query: URLSearchParams, key: string, value: string): void {
  const normalized = value.trim();
  if (normalized) query.set(key, normalized);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
