export function metricSet(overrides: Record<string, unknown> = {}) {
  return {
    answerAttempts: 4,
    answered: 2,
    approvedAnswerUsageCount: 1,
    declined: 1,
    escalatedCount: 1,
    escalationRate: 0.25,
    failed: 1,
    feedbackCount: 4,
    feedbackCoverageRate: 0.75,
    feedbackCoveredAnswerAttempts: 3,
    helpful: 3,
    medianReviewClosureMs: 1500,
    openReviewCount: 2,
    satisfactionRate: 0.75,
    unhelpful: 1,
    ...overrides,
  };
}

export function qualityMetricsPayload() {
  return {
    appliedFilters: {
      channel: null,
      from: '2026-08-01T00:00:00.000Z',
      language: null,
      to: '2026-08-08T00:00:00.000Z',
    },
    generatedAt: '2026-08-09T12:00:00.000Z',
    metrics: {
      breakdowns: {
        byChannel: [{ key: 'web', ...metricSet() }],
        byLanguage: [{ key: 'en', ...metricSet() }],
      },
      totals: metricSet(),
    },
    requestId: 'f100a18d-75ef-4c8e-aeb3-47663a61c1cb',
  };
}
