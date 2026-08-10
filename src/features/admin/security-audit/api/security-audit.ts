import { adminFetch } from '../../api/admin-fetch';
import type { SecurityAuditFilters, SecurityAuditSnapshot } from '../types';
import {
  parseSecurityAuditIntegrity,
  parseSecurityAuditPage,
  SecurityAuditApiError,
} from './security-audit-parser';

export async function fetchSecurityAudit(
  filters: SecurityAuditFilters,
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<SecurityAuditSnapshot> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const [pageResponse, integrityResponse] = await Promise.all([
    adminFetch(`/api/internal/security-audit?${query}`, { signal }),
    adminFetch('/api/internal/security-audit/integrity', { signal }),
  ]);
  return {
    integrity: parseSecurityAuditIntegrity(await readJson(integrityResponse)),
    page: parseSecurityAuditPage(await readJson(pageResponse)),
  };
}

async function readJson(response: Response): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SecurityAuditApiError('Security audit API returned invalid JSON.', response.status);
  }
  if (!response.ok) {
    const code = isObject(payload) && typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED';
    throw new SecurityAuditApiError(code, response.status);
  }
  return payload;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
