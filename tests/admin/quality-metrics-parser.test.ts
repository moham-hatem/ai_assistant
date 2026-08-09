import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseQualityMetricsResponse,
  QualityMetricsApiError,
} from '../../src/features/admin/quality-metrics/api/quality-metrics-parser.ts';
import { metricSet, qualityMetricsPayload } from './quality-metrics-fixtures.ts';

test('quality metrics parser accepts the exact aggregate contract', () => {
  const response = parseQualityMetricsResponse(qualityMetricsPayload());
  assert.equal(response.metrics.totals.answerAttempts, 4);
  assert.equal(response.metrics.breakdowns.byLanguage[0]?.key, 'en');
  assert.equal(response.appliedFilters.to, '2026-08-08T00:00:00.000Z');
});

test('quality metrics parser rejects extra sensitive fields and broken invariants', () => {
  assert.throws(() => parseQualityMetricsResponse({
    ...qualityMetricsPayload(),
    question: 'must never appear',
  }), QualityMetricsApiError);
  assert.throws(() => parseQualityMetricsResponse({
    ...qualityMetricsPayload(),
    metrics: {
      breakdowns: { byChannel: [], byLanguage: [] },
      totals: { ...metricSet(), comment: 'must never appear' },
    },
  }), QualityMetricsApiError);
  assert.throws(() => parseQualityMetricsResponse({
    ...qualityMetricsPayload(),
    metrics: {
      breakdowns: { byChannel: [], byLanguage: [] },
      totals: metricSet({ answered: 99 }),
    },
  }), QualityMetricsApiError);
  assert.throws(() => parseQualityMetricsResponse({
    ...qualityMetricsPayload(),
    metrics: {
      breakdowns: { byChannel: [], byLanguage: [] },
      totals: metricSet({ satisfactionRate: 1.1 }),
    },
  }), QualityMetricsApiError);
});
