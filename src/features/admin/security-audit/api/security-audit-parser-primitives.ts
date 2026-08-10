import type { SecurityAuditEvent } from '../../../../../shared/contracts/security-audit';
import { SecurityAuditApiError } from './security-audit-api-error';

export const identifierPattern = /^[\p{L}\p{N}._:@/-]{1,128}$/u;
const forbiddenMetadataName = /(email|password|passphrase|secret|token|cookie|link|hash|question|answer|content|bookText|text)/iu;

export function parseMetadata(value: unknown): SecurityAuditEvent['metadata'] {
  const payload = object(value, 'metadata');
  const result: SecurityAuditEvent['metadata'] = {};
  for (const [key, item] of Object.entries(payload)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(key) || forbiddenMetadataName.test(key)) invalid('metadata key');
    if (typeof item === 'string') {
      if (item.length > 80 || /[\r\n\0]/u.test(item)) invalid('metadata value');
      result[key] = item;
    } else if (typeof item === 'number') {
      if (!Number.isFinite(item)) invalid('metadata value');
      result[key] = item;
    } else if (typeof item === 'boolean') result[key] = item;
    else invalid('metadata value');
  }
  return result;
}

export function exactKeys(payload: Record<string, unknown>, keys: readonly string[], field: string): void {
  const actual = Object.keys(payload).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid(field);
}

export function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}

export function boundedInteger(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(field);
  return value;
}

export function enumeration<const T extends readonly string[]>(value: unknown, values: T, field: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) invalid(field);
  return value as T[number];
}

export function nullableEnumeration<const T extends readonly string[]>(
  value: unknown,
  values: T,
  field: string,
): T[number] | null {
  return value === null ? null : enumeration(value, values, field);
}

export function nullableIdentifier(value: unknown, field: string): string | null {
  return value === null ? null : patternString(value, identifierPattern, field);
}

export function patternString(value: unknown, pattern: RegExp, field: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) invalid(field);
  return value;
}

export function timestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') invalid(field);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) invalid(field);
  return value;
}

export function invalid(field: string): never {
  throw new SecurityAuditApiError(`Security audit API returned an invalid ${field}.`);
}
