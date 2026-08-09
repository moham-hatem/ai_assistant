import type { ReviewDetail, ReviewFilters, ReviewItem, ReviewPage, ReviewWorkspaceState } from './types';

export const emptyReviewFilters: ReviewFilters = {
  answerLanguage: '',
  channel: '',
  reviewerId: '',
  status: '',
};

export function createReviewWorkspaceState(): ReviewWorkspaceState {
  return {
    detail: null,
    detailRequestId: 0,
    detailStatus: 'idle',
    filters: emptyReviewFilters,
    listRequestId: 0,
    listStatus: 'loading',
    mutationError: null,
    mutationStatus: 'idle',
    offset: 0,
    page: null,
    selectedId: null,
    successKind: null,
  };
}

export type ReviewWorkspaceEvent =
  | { type: 'filters_changed'; filters: ReviewFilters }
  | { type: 'offset_changed'; offset: number }
  | { type: 'selected'; id: string | null }
  | { type: 'list_started'; requestId: number }
  | { type: 'list_succeeded'; page: ReviewPage; requestId: number }
  | { type: 'list_failed'; requestId: number }
  | { type: 'detail_started'; reviewId: string; requestId: number }
  | { type: 'detail_succeeded'; detail: ReviewDetail; reviewId: string; requestId: number }
  | { type: 'detail_failed'; reviewId: string; requestId: number }
  | { type: 'mutation_started' }
  | { type: 'mutation_succeeded'; detail?: ReviewDetail; item?: ReviewItem; kind: 'claim' | 'release' | 'decision'; reviewId: string }
  | { type: 'mutation_failed'; error: 'conflict' | 'generic' }
  | { type: 'feedback_cleared' };

export function reviewWorkspaceReducer(
  state: ReviewWorkspaceState,
  event: ReviewWorkspaceEvent,
): ReviewWorkspaceState {
  switch (event.type) {
    case 'filters_changed':
      return { ...state, filters: event.filters, offset: 0, selectedId: null, detail: null, detailStatus: 'idle' };
    case 'offset_changed':
      return { ...state, offset: event.offset, selectedId: null, detail: null, detailStatus: 'idle' };
    case 'selected':
      return { ...state, selectedId: event.id, detail: null, detailStatus: event.id ? 'loading' : 'idle' };
    case 'list_started':
      return { ...state, listRequestId: event.requestId, listStatus: 'loading' };
    case 'list_succeeded':
      return event.requestId === state.listRequestId
        ? { ...state, listStatus: 'ready', page: event.page }
        : state;
    case 'list_failed':
      return event.requestId === state.listRequestId ? { ...state, listStatus: 'error' } : state;
    case 'detail_started':
      return event.reviewId === state.selectedId
        ? { ...state, detailRequestId: event.requestId, detailStatus: 'loading' }
        : state;
    case 'detail_succeeded':
      return event.reviewId === state.selectedId && event.requestId === state.detailRequestId
        ? { ...state, detail: event.detail, detailStatus: 'ready' }
        : state;
    case 'detail_failed':
      return event.reviewId === state.selectedId && event.requestId === state.detailRequestId
        ? { ...state, detailStatus: 'error' }
        : state;
    case 'mutation_started':
      return { ...state, mutationError: null, mutationStatus: 'submitting', successKind: null };
    case 'mutation_succeeded':
      const updatedDetail = event.reviewId !== state.selectedId
        ? state.detail
        : event.detail ?? (event.item && state.detail ? { ...state.detail, item: event.item } : state.detail);
      return {
        ...state,
        detail: updatedDetail,
        detailStatus: event.reviewId === state.selectedId && updatedDetail ? 'ready' : state.detailStatus,
        mutationError: null,
        mutationStatus: 'idle',
        successKind: event.kind,
      };
    case 'mutation_failed':
      return { ...state, mutationError: event.error, mutationStatus: 'idle', successKind: null };
    case 'feedback_cleared':
      return { ...state, mutationError: null, successKind: null };
  }
}
