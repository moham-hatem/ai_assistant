import type { AccessUserDetails, AccessUserPage } from '../../../shared/contracts/access-management.ts';

export type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface AccessState {
  cursor: string | null;
  cursorHistory: Array<string | null>;
  detail: AccessUserDetails | null;
  detailRequestId: number;
  detailStatus: LoadStatus;
  listRequestId: number;
  listStatus: LoadStatus;
  page: AccessUserPage | null;
  reloadKey: number;
  selectedId: string | null;
}

export type AccessStateAction =
  | { requestId: number; type: 'list-loading' }
  | { page: AccessUserPage; requestId: number; type: 'list-loaded' }
  | { requestId: number; type: 'list-failed' }
  | { type: 'next-page' }
  | { type: 'previous-page' }
  | { type: 'retry-list' }
  | { id: string; requestId: number; type: 'select-user' }
  | { user: AccessUserDetails; requestId: number; type: 'detail-loaded' }
  | { requestId: number; type: 'detail-failed' }
  | { type: 'close-detail' }
  | { user: AccessUserDetails; type: 'user-updated' };

export const initialAccessState: AccessState = {
  cursor: null,
  cursorHistory: [],
  detail: null,
  detailRequestId: 0,
  detailStatus: 'loading',
  listRequestId: 0,
  listStatus: 'loading',
  page: null,
  reloadKey: 0,
  selectedId: null,
};

export function accessReducer(state: AccessState, action: AccessStateAction): AccessState {
  switch (action.type) {
    case 'list-loading':
      return { ...state, listRequestId: action.requestId, listStatus: 'loading' };
    case 'list-loaded':
      if (action.requestId !== state.listRequestId) return state;
      return { ...state, listStatus: action.page.items.length ? 'ready' : 'empty', page: action.page };
    case 'list-failed':
      return action.requestId === state.listRequestId ? { ...state, listStatus: 'error' } : state;
    case 'next-page':
      if (!state.page?.nextCursor) return state;
      return {
        ...state,
        cursor: state.page.nextCursor,
        cursorHistory: [...state.cursorHistory, state.cursor],
        listStatus: 'loading',
        page: null,
      };
    case 'previous-page': {
      if (!state.cursorHistory.length) return state;
      const history = state.cursorHistory.slice(0, -1);
      return { ...state, cursor: state.cursorHistory.at(-1) ?? null, cursorHistory: history, listStatus: 'loading', page: null };
    }
    case 'retry-list':
      return { ...state, listStatus: 'loading', reloadKey: state.reloadKey + 1 };
    case 'select-user':
      return { ...state, detail: null, detailRequestId: action.requestId, detailStatus: 'loading', selectedId: action.id };
    case 'detail-loaded':
      if (action.requestId !== state.detailRequestId || action.user.id !== state.selectedId) return state;
      return { ...state, detail: action.user, detailStatus: 'ready' };
    case 'detail-failed':
      return action.requestId === state.detailRequestId ? { ...state, detailStatus: 'error' } : state;
    case 'close-detail':
      return { ...state, detail: null, selectedId: null };
    case 'user-updated':
      return replaceUser(state, action.user);
  }
}

function replaceUser(state: AccessState, user: AccessUserDetails): AccessState {
  const page = state.page
    ? { ...state.page, items: state.page.items.map((item) => item.id === user.id ? user : item) }
    : null;
  return { ...state, detail: state.selectedId === user.id ? user : state.detail, page };
}
