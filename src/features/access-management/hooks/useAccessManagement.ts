import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  AccessUserDetails,
  CreateInvitationRequest,
  SecretLinkResponse,
  UpdateAccessUserRequest,
} from '../../../../shared/contracts/access-management';
import {
  createAccessInvitation,
  createAccessRecovery,
  fetchAccessUser,
  fetchAccessUsers,
  revokeAccessUserSessions,
  setAccessUserEnabled,
  updateAccessUser,
} from '../api/access-api';
import { accessReducer, initialAccessState } from '../access-state';
import { resolveAccessAction } from '../access-policies';
import { acquireSpaNavigationGuard } from '../../../app/spa-navigation-guard';

export type AccessAction = 'save' | 'enable' | 'disable' | 'sessions' | 'recovery';

export function useAccessManagement() {
  const [state, dispatch] = useReducer(accessReducer, initialAccessState);
  const [busyAction, setBusyAction] = useState<AccessAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<AccessAction | null>(null);
  const [inviting, setInviting] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ kind: 'invitation' | 'recovery'; value: SecretLinkResponse } | null>(null);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const actionLock = useRef(false);
  const invitationLock = useRef(false);
  const selectionVersion = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++listRequest.current;
    dispatch({ requestId, type: 'list-loading' });
    void fetchAccessUsers(state.cursor, 25, controller.signal).then(
      (page) => dispatch({ page, requestId, type: 'list-loaded' }),
      (error: unknown) => {
        if (!isAbort(error)) dispatch({ requestId, type: 'list-failed' });
      },
    );
    return () => controller.abort();
  }, [state.cursor, state.reloadKey]);

  useEffect(() => {
    if (!state.selectedId) return;
    const controller = new AbortController();
    const requestId = state.detailRequestId;
    void fetchAccessUser(state.selectedId, controller.signal).then(
      (user) => dispatch({ requestId, type: 'detail-loaded', user }),
      (error: unknown) => {
        if (!isAbort(error)) dispatch({ requestId, type: 'detail-failed' });
      },
    );
    return () => controller.abort();
  }, [state.detailRequestId, state.selectedId]);

  const selectUser = useCallback((id: string) => {
    if (actionLock.current || invitationLock.current || state.listStatus === 'loading') return;
    selectionVersion.current += 1;
    setActionError(null);
    setActionSuccess(null);
    dispatch({ id, requestId: ++detailRequest.current, type: 'select-user' });
  }, [state.listStatus]);

  const closeDetail = useCallback(() => {
    if (actionLock.current || invitationLock.current) return;
    selectionVersion.current += 1;
    setActionError(null);
    setActionSuccess(null);
    dispatch({ type: 'close-detail' });
  }, []);

  const navigateList = useCallback((type: 'next-page' | 'previous-page' | 'retry-list') => {
    if (actionLock.current || invitationLock.current || state.listStatus === 'loading') return;
    selectionVersion.current += 1;
    setActionError(null);
    setActionSuccess(null);
    dispatch({ type });
  }, [state.listStatus]);

  const runUserAction = useCallback(async (
    action: AccessAction,
    operation: () => Promise<AccessUserDetails | SecretLinkResponse | void>,
  ) => {
    if (actionLock.current || invitationLock.current) return;
    actionLock.current = true;
    const releaseNavigation = action === 'recovery'
      ? acquireSpaNavigationGuard(window.location.hash)
      : null;
    const version = selectionVersion.current;
    setBusyAction(action);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await operation();
      const resolved = resolveAccessAction(action, result, selectionVersion.current === version);
      if (resolved.secret) setSecret({ kind: 'recovery', value: resolved.secret });
      if (resolved.user) dispatch({ type: 'user-updated', user: resolved.user });
      if (resolved.success) setActionSuccess(resolved.success);
    } catch (error) {
      if (selectionVersion.current === version) setActionError(readErrorCode(error));
    } finally {
      actionLock.current = false;
      releaseNavigation?.();
      setBusyAction(null);
    }
  }, []);

  const saveUser = useCallback((id: string, update: UpdateAccessUserRequest) =>
    runUserAction('save', () => updateAccessUser(id, update)), [runUserAction]);
  const setEnabled = useCallback((id: string, enabled: boolean) =>
    runUserAction(enabled ? 'enable' : 'disable', () => setAccessUserEnabled(id, enabled)), [runUserAction]);
  const revokeSessions = useCallback((id: string) =>
    runUserAction('sessions', () => revokeAccessUserSessions(id)), [runUserAction]);
  const createRecovery = useCallback((id: string) =>
    runUserAction('recovery', () => createAccessRecovery(id)), [runUserAction]);

  const invite = useCallback(async (input: CreateInvitationRequest) => {
    if (invitationLock.current || actionLock.current) return false;
    invitationLock.current = true;
    const releaseNavigation = acquireSpaNavigationGuard(window.location.hash);
    setInviting(true);
    setInvitationError(null);
    try {
      const value = await createAccessInvitation(input);
      setSecret({ kind: 'invitation', value });
      return true;
    } catch (error) {
      setInvitationError(readErrorCode(error));
      return false;
    } finally {
      invitationLock.current = false;
      releaseNavigation();
      setInviting(false);
    }
  }, []);

  return {
    actionError,
    actionSuccess,
    busyAction,
    clearSecret: () => setSecret(null),
    closeDetail,
    createRecovery,
    invitationError,
    invite,
    inviting,
    nextPage: () => navigateList('next-page'),
    previousPage: () => navigateList('previous-page'),
    retryList: () => navigateList('retry-list'),
    revokeSessions,
    saveUser,
    secret,
    selectUser,
    setEnabled,
    state,
  };
}

function readErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'REQUEST_FAILED';
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
