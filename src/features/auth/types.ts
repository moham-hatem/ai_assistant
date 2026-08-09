import type { AuthPrincipal } from '../../../shared/contracts/auth.ts';

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous' | 'error';

export type AuthState =
  | { status: 'checking'; principal: null; requestId: number }
  | { status: 'authenticated'; principal: AuthPrincipal; requestId: number }
  | { status: 'anonymous'; principal: null; requestId: number }
  | { status: 'error'; principal: null; requestId: number; message: string };

export type AuthAction =
  | { type: 'checking'; requestId: number }
  | { type: 'resolved'; requestId: number; principal: AuthPrincipal | null }
  | { type: 'failed'; requestId: number; message: string }
  | { type: 'signed_out'; requestId: number };
