export type {
  QualityMetricSet,
  QualityMetrics,
  QualityMetricsBreakdown,
  QualityMetricsFilters,
  QualityMetricsResponse,
} from '../../../../shared/contracts/quality-metrics';

export interface QualityFilterDraft {
  channel: string;
  from: string;
  language: string;
  to: string;
}

export type QualityLoadStatus = 'error' | 'loading' | 'ready';
