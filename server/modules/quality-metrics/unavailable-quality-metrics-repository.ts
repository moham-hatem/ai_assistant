import type {
  QualityMetricsRepository,
  QualityMetricsSnapshot,
} from './quality-metrics-repository.ts';

export class UnavailableQualityMetricsRepository implements QualityMetricsRepository {
  private readonly cause: unknown;

  constructor(cause: unknown) {
    this.cause = cause;
  }

  async read(): Promise<QualityMetricsSnapshot> {
    throw new Error('The local quality metrics repository is unavailable.', { cause: this.cause });
  }
}
