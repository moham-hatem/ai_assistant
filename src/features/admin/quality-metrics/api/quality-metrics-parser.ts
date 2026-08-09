import type {
  QualityMetricSet,
  QualityMetricsBreakdown,
  QualityMetricsFilters,
  QualityMetricsResponse,
} from '../types';

const metricKeys = [
  'answerAttempts', 'answered', 'approvedAnswerUsageCount', 'declined',
  'escalatedCount', 'escalationRate', 'failed', 'feedbackCount',
  'feedbackCoverageRate', 'feedbackCoveredAnswerAttempts', 'helpful',
  'medianReviewClosureMs', 'openReviewCount', 'satisfactionRate', 'unhelpful',
] as const;

export class QualityMetricsApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'QualityMetricsApiError';
    this.status = status;
  }
}

export function parseQualityMetricsResponse(value: unknown): QualityMetricsResponse {
  const payload = objectWithKeys(value, ['appliedFilters', 'generatedAt', 'metrics', 'requestId'], 'response');
  const metrics = objectWithKeys(payload.metrics, ['breakdowns', 'totals'], 'metrics');
  const breakdowns = objectWithKeys(metrics.breakdowns, ['byChannel', 'byLanguage'], 'breakdowns');
  if (!Array.isArray(breakdowns.byChannel) || !Array.isArray(breakdowns.byLanguage)) invalid('breakdowns');
  return {
    appliedFilters: parseFilters(payload.appliedFilters),
    generatedAt: dateString(payload.generatedAt, 'generatedAt'),
    metrics: {
      breakdowns: {
        byChannel: breakdowns.byChannel.map(parseBreakdown),
        byLanguage: breakdowns.byLanguage.map(parseBreakdown),
      },
      totals: parseMetricSet(metrics.totals),
    },
    requestId: nonEmptyString(payload.requestId, 'requestId'),
  };
}

function parseFilters(value: unknown): QualityMetricsFilters {
  const filters = objectWithKeys(value, ['channel', 'from', 'language', 'to'], 'appliedFilters');
  return {
    channel: nullableString(filters.channel, 'channel'),
    from: nullableDate(filters.from, 'from'),
    language: nullableString(filters.language, 'language'),
    to: nullableDate(filters.to, 'to'),
  };
}

function parseBreakdown(value: unknown): QualityMetricsBreakdown {
  const payload = objectWithKeys(value, ['key', ...metricKeys], 'breakdown');
  const metrics = Object.fromEntries(metricKeys.map((key) => [key, payload[key]]));
  return { key: nonEmptyString(payload.key, 'key'), ...parseMetricSet(metrics) };
}

function parseMetricSet(value: unknown): QualityMetricSet {
  const payload = objectWithKeys(value, [...metricKeys], 'metric set');
  const result: QualityMetricSet = {
    answerAttempts: integer(payload.answerAttempts, 'answerAttempts'),
    answered: integer(payload.answered, 'answered'),
    approvedAnswerUsageCount: integer(payload.approvedAnswerUsageCount, 'approvedAnswerUsageCount'),
    declined: integer(payload.declined, 'declined'),
    escalatedCount: integer(payload.escalatedCount, 'escalatedCount'),
    escalationRate: rate(payload.escalationRate, 'escalationRate'),
    failed: integer(payload.failed, 'failed'),
    feedbackCount: integer(payload.feedbackCount, 'feedbackCount'),
    feedbackCoverageRate: rate(payload.feedbackCoverageRate, 'feedbackCoverageRate'),
    feedbackCoveredAnswerAttempts: integer(payload.feedbackCoveredAnswerAttempts, 'feedbackCoveredAnswerAttempts'),
    helpful: integer(payload.helpful, 'helpful'),
    medianReviewClosureMs: nullableNumber(payload.medianReviewClosureMs, 'medianReviewClosureMs'),
    openReviewCount: integer(payload.openReviewCount, 'openReviewCount'),
    satisfactionRate: rate(payload.satisfactionRate, 'satisfactionRate'),
    unhelpful: integer(payload.unhelpful, 'unhelpful'),
  };
  if (result.answered + result.declined + result.failed !== result.answerAttempts
    || result.helpful + result.unhelpful !== result.feedbackCount
    || result.escalatedCount > result.feedbackCount
    || result.feedbackCoveredAnswerAttempts > result.answerAttempts
    || result.approvedAnswerUsageCount > result.answerAttempts) invalid('metric invariants');
  return result;
}

function objectWithKeys(value: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(field);
  const payload = value as Record<string, unknown>;
  const actual = Object.keys(payload).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid(field);
  return payload;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid(field);
  return value;
}

function rate(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) invalid(field);
  return value;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) invalid(field);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  return value === null ? null : nonEmptyString(value, field);
}

function nullableDate(value: unknown, field: string): string | null {
  return value === null ? null : dateString(value, field);
}

function dateString(value: unknown, field: string): string {
  const text = nonEmptyString(value, field);
  if (Number.isNaN(Date.parse(text))) invalid(field);
  return text;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) invalid(field);
  return value;
}

function invalid(field: string): never {
  throw new QualityMetricsApiError(`Quality metrics API returned an invalid ${field}.`);
}
