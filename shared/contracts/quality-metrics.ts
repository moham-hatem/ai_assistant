export interface QualityMetricsFilters {
  channel: string | null;
  from: string | null;
  language: string | null;
  to: string | null;
}

export interface QualityMetricSet {
  answerAttempts: number;
  answered: number;
  approvedAnswerUsageCount: number;
  declined: number;
  escalatedCount: number;
  escalationRate: number | null;
  failed: number;
  feedbackCount: number;
  feedbackCoverageRate: number | null;
  feedbackCoveredAnswerAttempts: number;
  helpful: number;
  medianReviewClosureMs: number | null;
  openReviewCount: number;
  satisfactionRate: number | null;
  unhelpful: number;
}

export interface QualityMetricsBreakdown extends QualityMetricSet {
  key: string;
}

export interface QualityMetrics {
  breakdowns: {
    byChannel: QualityMetricsBreakdown[];
    byLanguage: QualityMetricsBreakdown[];
  };
  totals: QualityMetricSet;
}

export interface QualityMetricsResponse {
  appliedFilters: QualityMetricsFilters;
  generatedAt: string;
  metrics: QualityMetrics;
  requestId: string;
}
