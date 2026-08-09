import type {
  QuestionLogPage,
  QuestionLogRecord,
} from '../types';
import {
  parseQuestionLogDetail,
  parseQuestionLogPage,
  QuestionLogsApiError,
} from './question-log-parser';
import { adminFetch } from '../../api/admin-fetch.ts';

export { QuestionLogsApiError } from './question-log-parser';

export async function fetchQuestionLogPage(
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<QuestionLogPage> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const response = await adminFetch(`/api/internal/question-logs?${query}`, { signal });
  return parseQuestionLogPage(await readJson(response));
}

export async function fetchQuestionLogRecord(
  id: string,
  signal?: AbortSignal,
): Promise<QuestionLogRecord> {
  const response = await adminFetch(`/api/internal/question-logs/${encodeURIComponent(id)}`, { signal });
  return parseQuestionLogDetail(await readJson(response));
}

async function readJson(response: Response): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new QuestionLogsApiError('Question log API returned invalid JSON.', response.status);
  }
  if (!response.ok) {
    const error = isObject(payload) && typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED';
    throw new QuestionLogsApiError(error, response.status);
  }
  return payload;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
