import type {
  QuestionLogPage,
  QuestionLogRecord,
  QuestionLogSummary,
} from '../types';

const statuses = ['answered', 'declined', 'failed'] as const;
const channels = ['telegram', 'web'] as const;
const sufficiencies = ['sufficient', 'insufficient', 'unknown'] as const;

export class QuestionLogsApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'QuestionLogsApiError';
    this.status = status;
  }
}

export function parseQuestionLogPage(value: unknown): QuestionLogPage {
  const payload = asObject(value, 'list response');
  if (!Array.isArray(payload.items)) invalidPayload('items');
  return {
    items: payload.items.map(parseQuestionLogSummary),
    limit: readInteger(payload.limit, 'limit'),
    offset: readInteger(payload.offset, 'offset'),
    total: readInteger(payload.total, 'total'),
  };
}

export function parseQuestionLogDetail(value: unknown): QuestionLogRecord {
  return parseQuestionLogRecord(asObject(value, 'detail response').record);
}

export function parseQuestionLogRecord(value: unknown): QuestionLogRecord {
  const payload = asObject(value, 'record');
  if (!Array.isArray(payload.evidenceReferences)
    || !payload.evidenceReferences.every((item) => typeof item === 'string')) {
    invalidPayload('evidenceReferences');
  }
  const record: QuestionLogRecord = {
    ...parseQuestionLogSummary(payload),
    answer: readNullableString(payload.answer, 'answer'),
    apology: readNullableString(payload.apology, 'apology'),
    evidenceReferences: payload.evidenceReferences as string[],
  };
  const hasAnsweredShape = record.answer !== null && record.apology === null;
  const hasDeclinedShape = record.answer === null && record.apology !== null;
  if ((record.status === 'answered' && !hasAnsweredShape)
    || (record.status !== 'answered' && !hasDeclinedShape)) {
    invalidPayload('outcome');
  }
  return record;
}

function parseQuestionLogSummary(value: unknown): QuestionLogSummary {
  const payload = asObject(value, 'summary');
  return {
    answerLanguage: readString(payload.answerLanguage, 'answerLanguage'),
    channel: readEnum(payload.channel, channels, 'channel'),
    completedAt: readDate(payload.completedAt, 'completedAt'),
    grounded: readNullableBoolean(payload.grounded, 'grounded'),
    id: readString(payload.id, 'id'),
    latencyMs: readInteger(payload.latencyMs, 'latencyMs'),
    model: readNullableString(payload.model, 'model'),
    provider: readNullableString(payload.provider, 'provider'),
    question: readString(payload.question, 'question'),
    startedAt: readDate(payload.startedAt, 'startedAt'),
    status: readEnum(payload.status, statuses, 'status'),
    sufficiency: readEnum(payload.sufficiency, sufficiencies, 'sufficiency'),
  };
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!isObject(value)) invalidPayload(field);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') invalidPayload(field);
  return value;
}

function readNullableString(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== 'string') invalidPayload(field);
  return value as string | null;
}

function readInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalidPayload(field);
  return value;
}

function readDate(value: unknown, field: string): string {
  const date = readString(value, field);
  if (Number.isNaN(Date.parse(date))) invalidPayload(field);
  return date;
}

function readNullableBoolean(value: unknown, field: string): boolean | null {
  if (value !== null && typeof value !== 'boolean') invalidPayload(field);
  return value as boolean | null;
}

function readEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) invalidPayload(field);
  return value as T[number];
}

function invalidPayload(field: string): never {
  throw new QuestionLogsApiError(`Question log API returned an invalid ${field}.`);
}
