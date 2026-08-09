import type { QualityMetricsFilters } from '../../../shared/contracts/quality-metrics.ts';

export interface QualityMetricEvidence {
  answerAttempts: number;
  answered: number;
  approvedAnswerUsageCount: number;
  closureDurationsMs: number[];
  declined: number;
  escalatedCount: number;
  failed: number;
  feedbackCount: number;
  feedbackCoveredAnswerAttempts: number;
  helpful: number;
  openReviewCount: number;
  unhelpful: number;
}

export interface QualityMetricEvidenceGroup extends QualityMetricEvidence {
  key: string;
}

export interface QualityMetricsSnapshot {
  byChannel: QualityMetricEvidenceGroup[];
  byLanguage: QualityMetricEvidenceGroup[];
  totals: QualityMetricEvidence;
}

export interface QualityMetricsRepository {
  read(filters: QualityMetricsFilters): Promise<QualityMetricsSnapshot>;
}
