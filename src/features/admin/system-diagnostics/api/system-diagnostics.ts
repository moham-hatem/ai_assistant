import { adminFetch } from '../../api/admin-fetch';
import type { SystemDiagnosticsResponse } from '../types';
import {
  parseSystemDiagnosticsResponse,
  SystemDiagnosticsApiError,
} from './system-diagnostics-parser';

export async function fetchSystemDiagnostics(signal?: AbortSignal): Promise<SystemDiagnosticsResponse> {
  const response = await adminFetch('/api/internal/system-diagnostics', {
    cache: 'no-store',
    method: 'GET',
    signal,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SystemDiagnosticsApiError('System diagnostics API returned invalid JSON.', response.status);
  }
  if (!response.ok) {
    const code = isObject(payload) && typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED';
    throw new SystemDiagnosticsApiError(code, response.status);
  }
  return parseSystemDiagnosticsResponse(payload);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
