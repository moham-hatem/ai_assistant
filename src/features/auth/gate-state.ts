import type { AdminPage } from '../../app/routes.ts';
import { canOpenAdminPage } from './permissions.ts';
import type { AuthState } from './types.ts';

export type AdminGateView = 'loading' | 'login' | 'error' | 'redirect' | 'forbidden' | 'admin';

export function resolveAdminGate(state: AuthState, page: AdminPage, loginRoute: boolean): AdminGateView {
  if (state.status === 'checking') return 'loading';
  if (state.status === 'error') return 'error';
  if (state.status === 'anonymous') return 'login';
  if (loginRoute) return 'redirect';
  return canOpenAdminPage(state.principal, page) ? 'admin' : 'forbidden';
}
