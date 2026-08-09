import type { QualityMetricsFilters } from '../../../shared/contracts/quality-metrics.ts';

export type QualityMetricsDimension = 'channel' | 'language' | 'total';

interface SqlWhere {
  clause: string;
  values: string[];
}

export function dimensionExpression(
  dimension: QualityMetricsDimension,
  alias: string,
): string {
  if (dimension === 'language') return `${alias}.answer_language`;
  if (dimension === 'channel') return `${alias}.channel`;
  return 'NULL';
}

export function groupByDimension(dimension: QualityMetricsDimension, expression: string): string {
  return dimension === 'total' ? '' : `GROUP BY ${expression}`;
}

export function questionWhere(
  filters: QualityMetricsFilters,
  alias: string,
  timeColumn: 'decided_at' | 'started_at' | null,
  timeAlias = alias,
): SqlWhere {
  const conditions: string[] = [];
  const values: string[] = [];
  if (timeColumn && filters.from) {
    conditions.push(`${timeAlias}.${timeColumn} >= ?`);
    values.push(filters.from);
  }
  if (timeColumn && filters.to) {
    conditions.push(`${timeAlias}.${timeColumn} < ?`);
    values.push(filters.to);
  }
  if (filters.language) {
    conditions.push(`${alias}.answer_language = ?`);
    values.push(filters.language);
  }
  if (filters.channel) {
    conditions.push(`${alias}.channel = ?`);
    values.push(filters.channel);
  }
  return toWhere(conditions, values);
}

export function feedbackWhere(filters: QualityMetricsFilters, alias: string): SqlWhere {
  const conditions: string[] = [];
  const values: string[] = [];
  if (filters.from) {
    conditions.push(`${alias}.created_at >= ?`);
    values.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`${alias}.created_at < ?`);
    values.push(filters.to);
  }
  if (filters.language) {
    conditions.push(`${alias}.answer_language = ?`);
    values.push(filters.language);
  }
  if (filters.channel) {
    conditions.push(`${alias}.channel = ?`);
    values.push(filters.channel);
  }
  return toWhere(conditions, values);
}

export function feedbackTimeConditions(
  filters: QualityMetricsFilters,
  alias: string,
): SqlWhere {
  const conditions: string[] = [];
  const values: string[] = [];
  if (filters.from) {
    conditions.push(`${alias}.created_at >= ?`);
    values.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`${alias}.created_at < ?`);
    values.push(filters.to);
  }
  return toWhere(conditions, values);
}

function toWhere(conditions: string[], values: string[]): SqlWhere {
  return { clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', values };
}
