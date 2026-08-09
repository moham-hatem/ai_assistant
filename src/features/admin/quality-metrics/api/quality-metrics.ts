import type { QualityMetricsFilters, QualityMetricsResponse } from '../types';
import { parseQualityMetricsResponse, QualityMetricsApiError } from './quality-metrics-parser';

export async function fetchQualityMetrics(
  filters: QualityMetricsFilters,
  signal?: AbortSignal,
): Promise<QualityMetricsResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null) query.set(key, value);
  }
  const response = await fetch(`/api/internal/quality-metrics?${query}`, { signal });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new QualityMetricsApiError('Quality metrics API returned invalid JSON.', response.status);
  }
  if (!response.ok) {
    const code = isObject(payload) && typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED';
    throw new QualityMetricsApiError(code, response.status);
  }
  return parseQualityMetricsResponse(payload);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
