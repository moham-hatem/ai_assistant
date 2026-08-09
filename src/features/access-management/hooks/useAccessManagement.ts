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
  const invitationRequest = useRef(0);
  const invitationController = useRef<AbortController | null>(null);
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
    selectionVersion.current += 1;
    setActionError(null);
    setActionSuccess(null);
    dispatch({ id, requestId: ++detailRequest.current, type: 'select-user' });
  }, []);

  const closeDetail = useCallback(() => {
    selectionVersion.current += 1;
    setActionError(null);
    setActionSuccess(null);
    dispatch({ type: 'close-detail' });
  }, []);

  const runUserAction = useCallback(async (
    action: AccessAction,
    operation: () => Promise<AccessUserDetails | SecretLinkResponse | void>,
  ) => {
    if (actionLock.current) return;
    actionLock.current = true;
    const version = selectionVersion.current;
    setBusyAction(action);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await operation();
      if (selectionVersion.current !== version) return;
      if (result && 'link' in result) setSecret({ kind: 'recovery', value: result });
      else if (result) dispatch({ type: 'user-updated', user: result });
      setActionSuccess(action);
    } catch (error) {
      if (selectionVersion.current === version) setActionError(readErrorCode(error));
    } finally {
      actionLock.current = false;
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
    if (invitationLock.current) return false;
    invitationLock.current = true;
    const requestId = ++invitationRequest.current;
    const controller = new AbortController();
    invitationController.current = controller;
    setInviting(true);
    setInvitationError(null);
    try {
      const value = await createAccessInvitation(input, controller.signal);
      if (requestId !== invitationRequest.current) return false;
      setSecret({ kind: 'invitation', value });
      return true;
    } catch (error) {
      if (requestId === invitationRequest.current && !isAbort(error)) {
        setInvitationError(readErrorCode(error));
      }
      return false;
    } finally {
      invitationLock.current = false;
      if (requestId === invitationRequest.current) setInviting(false);
    }
  }, []);

  const cancelInvitation = useCallback(() => {
    invitationRequest.current += 1;
    invitationController.current?.abort();
    setInvitationError(null);
    setInviting(false);
  }, []);

  return {
    actionError,
    actionSuccess,
    busyAction,
    cancelInvitation,
    clearSecret: () => setSecret(null),
    closeDetail,
    createRecovery,
    dispatch,
    invitationError,
    invite,
    inviting,
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
