import type { AuthAction, AuthState } from './types.ts';

export const initialAuthState: AuthState = { status: 'checking', principal: null, requestId: 0 };

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  if (action.requestId < state.requestId) return state;
  switch (action.type) {
    case 'checking': return { status: 'checking', principal: null, requestId: action.requestId };
    case 'resolved': return action.principal
      ? { status: 'authenticated', principal: action.principal, requestId: action.requestId }
      : { status: 'anonymous', principal: null, requestId: action.requestId };
    case 'failed': return { status: 'error', principal: null, requestId: action.requestId, message: action.message };
    case 'signed_out': return { status: 'anonymous', principal: null, requestId: action.requestId };
  }
}

export function isCurrentAuthRequest(current: number, candidate: number): boolean {
  return current === candidate;
}
