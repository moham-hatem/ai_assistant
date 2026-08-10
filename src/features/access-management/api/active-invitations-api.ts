import { adminFetch } from '../../admin/api/admin-fetch.ts';
import type { ActiveInvitationPage } from '../active-invitation.ts';
import { AccessApiError } from './access-parser.ts';
import { parseActiveInvitationPage } from './active-invitations-parser.ts';

const INVITATIONS_PATH = '/api/internal/access/invitations';

export async function fetchActiveInvitations(
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<ActiveInvitationPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  const response = await request(`${INVITATIONS_PATH}?${query}`, { signal });
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new AccessApiError('Invitation API returned invalid JSON.', response.status); }
  if (!response.ok) throw responseError(response, payload);
  return parseActiveInvitationPage(payload);
}

export async function cancelActiveInvitation(id: string): Promise<void> {
  const response = await request(`${INVITATIONS_PATH}/${encodeURIComponent(id)}/revoke`, {
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (response.ok) return;
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* Keep the error opaque. */ }
  throw responseError(response, payload);
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  try { return await adminFetch(url, init); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AccessApiError('Invitation API could not be reached.', null, 'NETWORK_ERROR');
  }
}

function responseError(response: Response, payload: unknown): AccessApiError {
  const code = payload && typeof payload === 'object' && !Array.isArray(payload) &&
    typeof (payload as Record<string, unknown>).code === 'string'
    ? (payload as Record<string, string>).code
    : 'REQUEST_FAILED';
  return new AccessApiError(code, response.status, code);
}
