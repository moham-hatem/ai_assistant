import { ReviewsApiError } from './review-api-error.ts';

export function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}

export function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) invalid(field);
  return value;
}

export function readNullableString(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== 'string') invalid(field);
  return value as string | null;
}

export function readNullableNonEmptyString(value: unknown, field: string): string | null {
  return value === null ? null : readString(value, field);
}

export function readInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid(field);
  return value;
}

export function readDate(value: unknown, field: string): string {
  const date = readString(value, field);
  if (Number.isNaN(Date.parse(date))) invalid(field);
  return date;
}

export function readNullableBoolean(value: unknown, field: string): boolean | null {
  if (value !== null && typeof value !== 'boolean') invalid(field);
  return value as boolean | null;
}

export function readEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) invalid(field);
  return value as T[number];
}

export function invalid(field: string): never {
  throw new ReviewsApiError(`Review API returned an invalid ${field}.`);
}
