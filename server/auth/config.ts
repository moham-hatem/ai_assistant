export interface AuthConfig {
  absoluteTtlMs: number;
  databasePath: string;
  idleTtlMs: number;
  production: boolean;
  publicOrigin: string;
}

export function readAuthConfig(environment: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = environment.NODE_ENV === 'production';
  const publicOrigin = parseOrigin(
    environment.AUTH_PUBLIC_ORIGIN ?? (production ? '' : 'http://localhost:5173'),
  );
  if (production && !publicOrigin.startsWith('https://')) {
    throw new Error('AUTH_PUBLIC_ORIGIN must use HTTPS in production.');
  }
  const absoluteTtlMs = parsePositiveInteger(
    environment.AUTH_ABSOLUTE_TTL_MS,
    12 * 60 * 60_000,
  );
  const idleTtlMs = parsePositiveInteger(environment.AUTH_IDLE_TTL_MS, 30 * 60_000);
  if (absoluteTtlMs < idleTtlMs) {
    throw new Error('AUTH_ABSOLUTE_TTL_MS must be at least AUTH_IDLE_TTL_MS.');
  }
  const databasePath = environment.AUTH_DATABASE_PATH ?? 'data/auth.sqlite';
  if (!databasePath || databasePath.includes('\0')) throw new Error('Invalid AUTH_DATABASE_PATH.');
  return {
    absoluteTtlMs,
    databasePath,
    idleTtlMs,
    production,
    publicOrigin,
  };
}

function parseOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('AUTH_PUBLIC_ORIGIN must be an absolute HTTP(S) origin.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value.replace(/\/$/u, '')) {
    throw new Error('AUTH_PUBLIC_ORIGIN must contain only an HTTP(S) origin.');
  }
  return url.origin;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('Auth TTLs must be positive integers.');
  return parsed;
}
