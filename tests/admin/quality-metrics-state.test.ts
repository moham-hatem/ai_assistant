import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createQualityMetricsState,
  isQualityMetricsEmpty,
  qualityMetricsReducer,
} from '../../src/features/admin/quality-metrics/quality-metrics-state.ts';
import { formatCount, formatDuration, formatPercent } from '../../src/features/admin/quality-metrics/formatters.ts';
import { metricSet, qualityMetricsPayload } from './quality-metrics-fixtures.ts';

test('quality metrics state applies UTC filters and rejects reversed ranges', () => {
  let state = createQualityMetricsState(new Date('2026-08-09T12:30:00.000Z'));
  assert.equal(state.filters.to, '2026-08-09T12:30:00.000Z');
  state = qualityMetricsReducer(state, { field: 'language', type: 'draft-changed', value: 'en' });
  state = qualityMetricsReducer(state, { type: 'apply' });
  assert.equal(state.filters.language, 'en');
  assert.equal(state.status, 'loading');

  state = qualityMetricsReducer(state, { field: 'from', type: 'draft-changed', value: '2026-08-10T00:00' });
  state = qualityMetricsReducer(state, { type: 'apply' });
  assert.equal(state.validationError, 'invalid-range');
});

test('quality state models loaded, retry, error, and truly empty aggregates', () => {
  let state = createQualityMetricsState(new Date('2026-08-09T12:30:00.000Z'));
  const response = qualityMetricsPayload();
  state = qualityMetricsReducer(state, { response, type: 'loaded' });
  assert.equal(state.status, 'ready');
  assert.equal(isQualityMetricsEmpty(response), false);
  state = qualityMetricsReducer(state, { type: 'retry' });
  assert.equal(state.reloadKey, 1);
  state = qualityMetricsReducer(state, { type: 'failed' });
  assert.equal(state.status, 'error');

  const empty = qualityMetricsPayload();
  empty.metrics.totals = metricSet({
    answerAttempts: 0, answered: 0, approvedAnswerUsageCount: 0, declined: 0,
    escalatedCount: 0, escalationRate: null, failed: 0, feedbackCount: 0,
    feedbackCoverageRate: null, feedbackCoveredAnswerAttempts: 0, helpful: 0,
    medianReviewClosureMs: null, openReviewCount: 0, satisfactionRate: null, unhelpful: 0,
  });
  assert.equal(isQualityMetricsEmpty(empty), true);
});

test('quality formatting exposes percentages, counts, and readable durations', () => {
  assert.equal(formatPercent(0.5, 'en'), '50%');
  assert.equal(formatPercent(null, 'en'), '—');
  assert.equal(formatCount(1200, 'en'), '1,200');
  assert.equal(formatDuration(1500, 'en'), '1.5 sec');
  assert.equal(formatDuration(90_000, 'en'), '1.5 min');
  assert.notEqual(formatDuration(1500, 'ar'), formatDuration(1500, 'en'));
  assert.doesNotMatch(formatDuration(1500, 'ar'), / s$/u);
  assert.doesNotMatch(formatDuration(90_000, 'sw'), / min$/u);
});
