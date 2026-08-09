import { parseLoginResponse, parseSessionResponse } from './parser.ts';
import type { LoginRequest, LoginResponse, SessionResponse } from '../../../shared/contracts/auth.ts';

export class AuthApiError extends Error {
  readonly status: number | null;
  readonly code: 'invalid_credentials' | 'forbidden' | 'invalid_response' | 'unavailable';

  constructor(
    message: string,
    status: number | null,
    code: 'invalid_credentials' | 'forbidden' | 'invalid_response' | 'unavailable',
  ) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
  }
}

export async function loginRequest(email: string, password: string, signal?: AbortSignal): Promise<LoginResponse> {
  const request: LoginRequest = { email, password };
  const response = await authRequest('/api/auth/login', {
    body: JSON.stringify(request),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal,
  });
  return parseLoginResponse(await json(response));
}

export async function sessionRequest(signal?: AbortSignal): Promise<SessionResponse> {
  const response = await authRequest('/api/auth/session', { method: 'GET', signal });
  return parseSessionResponse(await json(response));
}

export async function logoutRequest(signal?: AbortSignal): Promise<void> {
  const response = await authRequest('/api/auth/logout', { method: 'POST', signal });
  if (response.status !== 204) throw new AuthApiError('Unexpected logout response.', response.status, 'invalid_response');
}

async function authRequest(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: 'same-origin' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AuthApiError('Authentication service unavailable.', null, 'unavailable');
  }
  if (response.status === 401) throw new AuthApiError('Invalid credentials.', 401, 'invalid_credentials');
  if (response.status === 403) throw new AuthApiError('Access forbidden.', 403, 'forbidden');
  if (!response.ok) throw new AuthApiError('Authentication service unavailable.', response.status, 'unavailable');
  return response;
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { throw new AuthApiError('Invalid authentication response.', response.status, 'invalid_response'); }
}
