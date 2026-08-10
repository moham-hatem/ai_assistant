import type { ActiveInvitationPage } from './active-invitation';
import type { LoadStatus } from './access-state';

export interface ActiveInvitationsState {
  actionError: string | null;
  cancelRequestId: number;
  cancelingId: string | null;
  cursor: string | null;
  cursorHistory: Array<string | null>;
  listRequestId: number;
  page: ActiveInvitationPage | null;
  reloadKey: number;
  status: LoadStatus;
}

export type ActiveInvitationsAction =
  | { requestId: number; type: 'list-loading' }
  | { page: ActiveInvitationPage; requestId: number; type: 'list-loaded' }
  | { requestId: number; type: 'list-failed' }
  | { type: 'next-page' }
  | { type: 'previous-page' }
  | { type: 'retry-list' }
  | { id: string; requestId: number; type: 'cancel-started' }
  | { id: string; requestId: number; type: 'cancel-succeeded' }
  | { code: string; requestId: number; type: 'cancel-failed' };

export const initialActiveInvitationsState: ActiveInvitationsState = {
  actionError: null,
  cancelRequestId: 0,
  cancelingId: null,
  cursor: null,
  cursorHistory: [],
  listRequestId: 0,
  page: null,
  reloadKey: 0,
  status: 'loading',
};

export function activeInvitationsReducer(
  state: ActiveInvitationsState,
  action: ActiveInvitationsAction,
): ActiveInvitationsState {
  switch (action.type) {
    case 'list-loading':
      return { ...state, listRequestId: action.requestId, status: 'loading' };
    case 'list-loaded':
      if (action.requestId !== state.listRequestId) return state;
      return { ...state, page: action.page, status: action.page.items.length ? 'ready' : 'empty' };
    case 'list-failed':
      return action.requestId === state.listRequestId ? { ...state, status: 'error' } : state;
    case 'next-page':
      if (!state.page?.nextCursor || state.cancelingId) return state;
      return {
        ...state,
        actionError: null,
        cursor: state.page.nextCursor,
        cursorHistory: [...state.cursorHistory, state.cursor],
        page: null,
        status: 'loading',
      };
    case 'previous-page': {
      if (!state.cursorHistory.length || state.cancelingId) return state;
      const cursorHistory = state.cursorHistory.slice(0, -1);
      return {
        ...state,
        actionError: null,
        cursor: state.cursorHistory.at(-1) ?? null,
        cursorHistory,
        page: null,
        status: 'loading',
      };
    }
    case 'retry-list':
      if (state.cancelingId) return state;
      return { ...state, actionError: null, page: null, reloadKey: state.reloadKey + 1, status: 'loading' };
    case 'cancel-started':
      if (state.cancelingId) return state;
      return { ...state, actionError: null, cancelingId: action.id, cancelRequestId: action.requestId };
    case 'cancel-succeeded': {
      if (action.requestId !== state.cancelRequestId || action.id !== state.cancelingId) return state;
      const items = state.page?.items.filter((item) => item.id !== action.id) ?? [];
      const page = state.page ? { ...state.page, items } : null;
      return {
        ...state,
        cancelingId: null,
        page,
        reloadKey: state.reloadKey + 1,
        status: page && !page.items.length && !page.nextCursor ? 'empty' : state.status,
      };
    }
    case 'cancel-failed':
      return action.requestId === state.cancelRequestId
        ? { ...state, actionError: action.code, cancelingId: null }
        : state;
  }
}
