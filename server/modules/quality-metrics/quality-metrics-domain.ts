import type {
  QualityMetricSet,
  QualityMetrics,
} from '../../../shared/contracts/quality-metrics.ts';
import type {
  QualityMetricEvidence,
  QualityMetricEvidenceGroup,
  QualityMetricsSnapshot,
} from './quality-metrics-repository.ts';

export function buildQualityMetrics(snapshot: QualityMetricsSnapshot): QualityMetrics {
  return {
    breakdowns: {
      byChannel: snapshot.byChannel.map(toBreakdown),
      byLanguage: snapshot.byLanguage.map(toBreakdown),
    },
    totals: toMetricSet(snapshot.totals),
  };
}

function toBreakdown(evidence: QualityMetricEvidenceGroup) {
  return { key: evidence.key, ...toMetricSet(evidence) };
}

function toMetricSet(evidence: QualityMetricEvidence): QualityMetricSet {
  return {
    answerAttempts: evidence.answerAttempts,
    answered: evidence.answered,
    approvedAnswerUsageCount: evidence.approvedAnswerUsageCount,
    declined: evidence.declined,
    escalatedCount: evidence.escalatedCount,
    escalationRate: rate(evidence.escalatedCount, evidence.feedbackCount),
    failed: evidence.failed,
    feedbackCount: evidence.feedbackCount,
    feedbackCoverageRate: rate(
      evidence.feedbackCoveredAnswerAttempts,
      evidence.answerAttempts,
    ),
    feedbackCoveredAnswerAttempts: evidence.feedbackCoveredAnswerAttempts,
    helpful: evidence.helpful,
    medianReviewClosureMs: median(evidence.closureDurationsMs),
    openReviewCount: evidence.openReviewCount,
    satisfactionRate: rate(evidence.helpful, evidence.helpful + evidence.unhelpful),
    unhelpful: evidence.unhelpful,
  };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}
