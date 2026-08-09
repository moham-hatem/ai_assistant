import type {
  QualityMetricsFilters,
  QualityMetricsResponse,
} from '../../../shared/contracts/quality-metrics.ts';
import { buildQualityMetrics } from './quality-metrics-domain.ts';
import type { QualityMetricsRepository } from './quality-metrics-repository.ts';

export class QualityMetricsService {
  private readonly repository: QualityMetricsRepository;
  private readonly now: () => Date;

  constructor(
    repository: QualityMetricsRepository,
    now: () => Date = () => new Date(),
  ) {
    this.repository = repository;
    this.now = now;
  }

  async getMetrics(
    filters: QualityMetricsFilters,
    requestId: string,
  ): Promise<QualityMetricsResponse> {
    return {
      appliedFilters: filters,
      generatedAt: this.now().toISOString(),
      metrics: buildQualityMetrics(await this.repository.read(filters)),
      requestId,
    };
  }
}
