import { SystemDiagnosticsApiError } from './system-diagnostics-api-error';

const canonicalTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}

export function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  field: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) invalid(field);
}

export function optionalKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid(field);
}

export function enumeration<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) invalid(field);
  return value as T[number];
}

export function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalid(field);
  return value;
}

export function boundedInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid(field);
  return value;
}

export function timestamp(value: unknown, field: string): string {
  const text = patternString(value, canonicalTimestamp, field);
  if (!Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) invalid(field);
  return text;
}

export function patternString(value: unknown, pattern: RegExp, field: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) invalid(field);
  return value;
}

export function invalid(field: string): never {
  throw new SystemDiagnosticsApiError(`System diagnostics API returned an invalid ${field}.`);
}
