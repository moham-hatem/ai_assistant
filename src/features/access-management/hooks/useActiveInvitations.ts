import { useCallback, useEffect, useReducer, useRef } from 'react';
import { cancelActiveInvitation, fetchActiveInvitations } from '../api/active-invitations-api';
import { createInvitationCancellationHandler } from '../active-invitation-cancel';
import {
  activeInvitationsReducer,
  initialActiveInvitationsState,
} from '../active-invitations-state';

export function useActiveInvitations() {
  const [state, dispatch] = useReducer(activeInvitationsReducer, initialActiveInvitationsState);
  const listRequest = useRef(0);
  const cancel = useRef<((id: string) => Promise<boolean>) | null>(null);

  if (!cancel.current) {
    cancel.current = createInvitationCancellationHandler(cancelActiveInvitation, {
      failed: (requestId, code) => dispatch({ code, requestId, type: 'cancel-failed' }),
      started: (requestId, id) => dispatch({ id, requestId, type: 'cancel-started' }),
      succeeded: (requestId, id) => dispatch({ id, requestId, type: 'cancel-succeeded' }),
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++listRequest.current;
    dispatch({ requestId, type: 'list-loading' });
    void fetchActiveInvitations(state.cursor, 10, controller.signal).then(
      (page) => dispatch({ page, requestId, type: 'list-loaded' }),
      (error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          dispatch({ requestId, type: 'list-failed' });
        }
      },
    );
    return () => controller.abort();
  }, [state.cursor, state.reloadKey]);

  const navigate = useCallback((type: 'next-page' | 'previous-page' | 'retry-list') => {
    if (state.status === 'loading' || state.cancelingId) return;
    dispatch({ type });
  }, [state.cancelingId, state.status]);

  return {
    cancel: (id: string) => cancel.current!(id),
    nextPage: () => navigate('next-page'),
    previousPage: () => navigate('previous-page'),
    reload: () => navigate('retry-list'),
    state,
  };
}
