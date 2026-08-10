import { InvalidAccessInputError } from './access-errors.ts';

export function parseAccessCursor(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 128 || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new InvalidAccessInputError();
  }
  return value;
}

export function parseAccessLimit(value: unknown): number {
  if (value === null || value === undefined || value === '') return 25;
  const parsed = typeof value === 'string' && /^\d{1,3}$/u.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new InvalidAccessInputError();
  }
  return parsed;
}
