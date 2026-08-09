import { AppError } from '../../errors.ts';
import type { QualityMetricsFilters } from '../../../shared/contracts/quality-metrics.ts';

const allowedParameters = new Set(['from', 'to', 'language', 'channel']);
const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const languagePattern = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/iu;
const channelPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/iu;

export function parseQualityMetricsQuery(url: URL): QualityMetricsFilters {
  for (const key of url.searchParams.keys()) {
    if (!allowedParameters.has(key) || url.searchParams.getAll(key).length !== 1) invalidQuery();
  }
  const filters: QualityMetricsFilters = {
    channel: optionalIdentifier(url.searchParams.get('channel'), channelPattern),
    from: optionalTimestamp(url.searchParams.get('from')),
    language: optionalIdentifier(url.searchParams.get('language'), languagePattern),
    to: optionalTimestamp(url.searchParams.get('to')),
  };
  if (filters.from && filters.to && filters.from >= filters.to) invalidQuery();
  return filters;
}

function optionalTimestamp(value: string | null): string | null {
  if (value === null) return null;
  if (!utcTimestamp.test(value)) invalidQuery();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) invalidQuery();
  const normalized = new Date(timestamp).toISOString();
  if (normalized !== canonicalTimestamp(value)) invalidQuery();
  return normalized;
}

function canonicalTimestamp(value: string): string {
  if (!value.includes('.')) return value.replace(/Z$/u, '.000Z');
  return value.replace(/\.(\d{1,3})Z$/u, (_, fraction: string) => `.${fraction.padEnd(3, '0')}Z`);
}

function optionalIdentifier(value: string | null, pattern: RegExp): string | null {
  if (value === null) return null;
  if (!pattern.test(value)) invalidQuery();
  return value;
}

function invalidQuery(): never {
  throw new AppError('INVALID_REQUEST', 'Invalid quality metrics query.', 400);
}
