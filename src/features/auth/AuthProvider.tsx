import { createContext, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { ADMIN_FORBIDDEN_EVENT, ADMIN_UNAUTHORIZED_EVENT } from '../admin/api/admin-fetch';
import { loginRequest, logoutRequest, sessionRequest } from './api';
import { authReducer, initialAuthState } from './state';
import type { AuthState } from './types';

export interface AuthContextValue {
  state: AuthState;
  forbiddenVersion: number;
  clearForbidden: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const [forbiddenVersion, setForbiddenVersion] = useState(0);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const begin = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return { controller, requestId: ++requestRef.current };
  }, []);

  const check = useCallback(() => {
    const { controller, requestId } = begin();
    dispatch({ type: 'checking', requestId });
    void sessionRequest(controller.signal).then(
      ({ principal }) => dispatch({ type: 'resolved', principal, requestId }),
      (error: unknown) => {
        if (isAbort(error)) return;
        dispatch({ type: 'failed', requestId, message: 'session_failed' });
      },
    );
  }, [begin]);

  useEffect(() => {
    check();
    return () => controllerRef.current?.abort();
  }, [check]);

  useEffect(() => {
    const unauthorized = () => {
      controllerRef.current?.abort();
      dispatch({ type: 'signed_out', requestId: ++requestRef.current });
    };
    const forbidden = () => setForbiddenVersion((value) => value + 1);
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, unauthorized);
    window.addEventListener(ADMIN_FORBIDDEN_EVENT, forbidden);
    return () => {
      window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, unauthorized);
      window.removeEventListener(ADMIN_FORBIDDEN_EVENT, forbidden);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { controller, requestId } = begin();
    const { principal } = await loginRequest(email, password, controller.signal);
    dispatch({ type: 'resolved', principal, requestId });
  }, [begin]);

  const logout = useCallback(async () => {
    const { controller, requestId } = begin();
    await logoutRequest(controller.signal);
    dispatch({ type: 'signed_out', requestId });
    setForbiddenVersion(0);
  }, [begin]);

  const value = useMemo<AuthContextValue>(() => ({
    clearForbidden: () => setForbiddenVersion(0),
    forbiddenVersion,
    login,
    logout,
    retry: check,
    state,
  }), [check, forbiddenVersion, login, logout, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
