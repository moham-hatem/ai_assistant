import type {
  AccessUserDetails,
  AccessUserPage,
  CreateInvitationRequest,
  SecretLinkResponse,
  UpdateAccessUserRequest,
} from '../../../../shared/contracts/access-management.ts';
import { adminFetch } from '../../admin/api/admin-fetch.ts';
import {
  AccessApiError,
  parseAccessUserAction,
  parseAccessUserDetails,
  parseAccessUserPage,
  parseSecretLink,
} from './access-parser.ts';

const USERS_PATH = '/api/internal/access/users';

export function fetchAccessUsers(
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<AccessUserPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return adminRequest(`${USERS_PATH}?${query}`, { signal }).then(parseAccessUserPage);
}

export function fetchAccessUser(id: string, signal?: AbortSignal): Promise<AccessUserDetails> {
  return adminRequest(userPath(id), { signal }).then(parseAccessUserDetails);
}

export function updateAccessUser(
  id: string,
  update: UpdateAccessUserRequest,
): Promise<AccessUserDetails> {
  return adminRequest(userPath(id), jsonRequest('PATCH', update)).then(parseAccessUserAction);
}

export function setAccessUserEnabled(id: string, enabled: boolean): Promise<AccessUserDetails> {
  return adminRequest(`${userPath(id)}/${enabled ? 'enable' : 'disable'}`, jsonRequest('POST', {}))
    .then(parseAccessUserAction);
}

export async function revokeAccessUserSessions(id: string): Promise<void> {
  await adminRequest(`${userPath(id)}/revoke-sessions`, jsonRequest('POST', {}), true);
}

export function createAccessRecovery(id: string): Promise<SecretLinkResponse> {
  return adminRequest(`${userPath(id)}/recovery`, jsonRequest('POST', {})).then(parseSecretLink);
}

export function createAccessInvitation(input: CreateInvitationRequest, signal?: AbortSignal): Promise<SecretLinkResponse> {
  return adminRequest('/api/internal/access/invitations', { ...jsonRequest('POST', input), signal })
    .then(parseSecretLink);
}

export async function redeemPasswordToken(
  mode: 'invitation' | 'recovery',
  token: string,
  password: string,
  signal?: AbortSignal,
): Promise<void> {
  const path = mode === 'invitation'
    ? '/api/auth/invitations/redeem'
    : '/api/auth/recovery/redeem';
  let response: Response;
  try {
    response = await fetch(path, {
      ...jsonRequest('POST', { password, token }),
      credentials: 'same-origin',
      signal,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new AccessApiError('Password request failed.', null, 'NETWORK_ERROR');
  }
  if (!response.ok) throw new AccessApiError('Password request rejected.', response.status, 'REQUEST_REJECTED');
}

function userPath(id: string): string {
  return `${USERS_PATH}/${encodeURIComponent(id)}`;
}

function jsonRequest(method: 'PATCH' | 'POST', body: object): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  };
}

async function adminRequest(url: string, init?: RequestInit, empty = false): Promise<unknown> {
  let response: Response;
  try {
    response = await adminFetch(url, init);
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new AccessApiError('Access API could not be reached.', null, 'NETWORK_ERROR');
  }
  if (empty && response.ok) return undefined;
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new AccessApiError('Access API returned invalid JSON.', response.status); }
  if (!response.ok) {
    const code = readCode(payload);
    throw new AccessApiError(code, response.status, code);
  }
  return payload;
}

function readCode(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const code = (value as Record<string, unknown>).code;
    if (typeof code === 'string') return code;
  }
  return 'REQUEST_FAILED';
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
