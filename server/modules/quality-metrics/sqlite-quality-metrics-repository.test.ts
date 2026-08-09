import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQualityMetrics, median } from './quality-metrics-domain.ts';
import { SqliteQualityMetricsRepository } from './sqlite-quality-metrics-repository.ts';
import { createQualityMetricsFixture, fixtureFilters } from './quality-metrics-test-fixture.ts';

test('SQLite quality metrics calculate exact totals, distinct coverage, and even median', async () => {
  const fixture = await createQualityMetricsFixture();
  const repository = new SqliteQualityMetricsRepository(fixture.path);
  try {
    const metrics = buildQualityMetrics(await repository.read(fixtureFilters()));
    assert.deepEqual(metrics.totals, {
      answerAttempts: 3,
      answered: 1,
      approvedAnswerUsageCount: 1,
      declined: 1,
      escalatedCount: 2,
      escalationRate: 0.5,
      failed: 1,
      feedbackCount: 4,
      feedbackCoverageRate: 1,
      feedbackCoveredAnswerAttempts: 3,
      helpful: 2,
      medianReviewClosureMs: 2000,
      openReviewCount: 2,
      satisfactionRate: 0.5,
      unhelpful: 2,
    });
    assert.deepEqual(metrics.breakdowns.byLanguage.map(({ key }) => key), ['ar', 'en', 'sw']);
    assert.deepEqual(metrics.breakdowns.byChannel.map(({ key }) => key), ['telegram', 'web']);
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

test('filters use inclusive from and exclusive to across each metric clock', async () => {
  const fixture = await createQualityMetricsFixture();
  const repository = new SqliteQualityMetricsRepository(fixture.path);
  try {
    const metrics = buildQualityMetrics(await repository.read(fixtureFilters({
      channel: 'web',
      language: 'en',
    })));
    assert.equal(metrics.totals.answerAttempts, 2);
    assert.equal(metrics.totals.feedbackCount, 3);
    assert.equal(metrics.totals.feedbackCoveredAnswerAttempts, 2);
    assert.equal(metrics.totals.satisfactionRate, 2 / 3);
    assert.equal(metrics.totals.escalationRate, 1 / 3);
    assert.equal(metrics.totals.openReviewCount, 1);
    assert.equal(metrics.totals.medianReviewClosureMs, 1000);
    assert.equal(metrics.totals.approvedAnswerUsageCount, 1);
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

test('empty evidence returns zero counts and null rates while median handles odd and even sets', async () => {
  const fixture = await createQualityMetricsFixture();
  const repository = new SqliteQualityMetricsRepository(fixture.path);
  try {
    const metrics = buildQualityMetrics(await repository.read(fixtureFilters({ language: 'zz' })));
    assert.equal(metrics.totals.answerAttempts, 0);
    assert.equal(metrics.totals.satisfactionRate, null);
    assert.equal(metrics.totals.feedbackCoverageRate, null);
    assert.equal(metrics.totals.escalationRate, null);
    assert.equal(metrics.totals.medianReviewClosureMs, null);
    assert.deepEqual(metrics.breakdowns.byLanguage, []);
    assert.equal(median([3000]), 3000);
    assert.equal(median([1000, 3000]), 2000);
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});
