import {
  CLIENT_API_VERSION,
  type ApiVersionContract,
} from '../../shared/contracts/api-version.ts';

export const API_COMPATIBILITY_ENDPOINT = '/api/meta/version';
export const API_COMPATIBILITY_TIMEOUT_MS = 5_000;

export type ApiCompatibilityState =
  | { readonly status: 'compatible'; readonly apiVersion: string }
  | { readonly status: 'incompatible'; readonly apiVersion: string }
  | { readonly status: 'unavailable' };

export interface ApiCompatibilityDependencies {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly timeoutSignal?: (timeoutMs: number) => AbortSignal;
}

export async function checkApiCompatibility(
  dependencies: ApiCompatibilityDependencies = {},
): Promise<ApiCompatibilityState> {
  const request = dependencies.fetch ?? fetch;
  const timeoutMs = dependencies.timeoutMs ?? API_COMPATIBILITY_TIMEOUT_MS;
  const timeoutSignal = dependencies.timeoutSignal ?? AbortSignal.timeout;

  try {
    const response = await request(API_COMPATIBILITY_ENDPOINT, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: timeoutSignal(timeoutMs),
    });
    if (!response.ok) return { status: 'unavailable' };

    return evaluateApiCompatibility(
      CLIENT_API_VERSION,
      parseApiVersionContract(await response.json()),
    );
  } catch {
    return { status: 'unavailable' };
  }
}

export function evaluateApiCompatibility(
  clientVersion: string,
  contract: ApiVersionContract,
): ApiCompatibilityState {
  return contract.compatibleClientVersions.includes(clientVersion)
    ? { status: 'compatible', apiVersion: contract.apiVersion }
    : { status: 'incompatible', apiVersion: contract.apiVersion };
}

export function parseApiVersionContract(value: unknown): ApiVersionContract {
  if (!isRecord(value) || !hasExactKeys(value, ['apiVersion', 'compatibleClientVersions'])) {
    throw new TypeError('Invalid API version contract');
  }
  if (!isVersion(value.apiVersion) || !Array.isArray(value.compatibleClientVersions)) {
    throw new TypeError('Invalid API version contract');
  }
  if (!value.compatibleClientVersions.every(isVersion)) {
    throw new TypeError('Invalid API version contract');
  }

  return {
    apiVersion: value.apiVersion,
    compatibleClientVersions: [...value.compatibleClientVersions],
  };
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}
