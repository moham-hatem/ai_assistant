import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { fetchReview, fetchReviewPage } from '../api/reviews';
import { nextReviewOffset, previousReviewOffset } from '../pagination';
import {
  createReviewWorkspaceState,
  reviewWorkspaceReducer,
  type ReviewWorkspaceEvent,
} from '../reviews-state';
import type { ReviewFilters } from '../types';

const PAGE_SIZE = 10;

export function useReviewData() {
  const [state, dispatch] = useReducer(reviewWorkspaceReducer, undefined, createReviewWorkspaceState);
  const [detailReload, setDetailReload] = useState(0);
  const [listReload, setListReload] = useState(0);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++listSequence.current;
    dispatch({ type: 'list_started', requestId });
    void fetchReviewPage({ ...state.filters, limit: PAGE_SIZE, offset: state.offset }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        if (page.items.length === 0 && state.offset > 0 && page.total > 0) {
          dispatch({ type: 'offset_changed', offset: previousReviewOffset(state.offset, PAGE_SIZE) });
          return;
        }
        dispatch({ type: 'list_succeeded', page, requestId });
      })
      .catch(() => {
        if (!controller.signal.aborted) dispatch({ type: 'list_failed', requestId });
      });
    return () => controller.abort();
  }, [listReload, state.filters, state.offset]);

  useEffect(() => {
    if (!state.selectedId) return;
    const reviewId = state.selectedId;
    const controller = new AbortController();
    const requestId = ++detailSequence.current;
    dispatch({ type: 'detail_started', requestId, reviewId });
    void fetchReview(reviewId, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) {
          dispatch({ type: 'detail_succeeded', detail, requestId, reviewId });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) dispatch({ type: 'detail_failed', requestId, reviewId });
      });
    return () => controller.abort();
  }, [detailReload, state.selectedId]);

  const changeFilters = useCallback((filters: ReviewFilters) => {
    dispatch({ type: 'filters_changed', filters });
  }, []);
  const select = useCallback((id: string) => dispatch({ type: 'selected', id }), []);
  const clearSelection = useCallback(() => dispatch({ type: 'selected', id: null }), []);
  const retryList = useCallback(() => setListReload((value) => value + 1), []);
  const retryDetail = useCallback(() => setDetailReload((value) => value + 1), []);
  const refreshAll = useCallback(() => {
    setListReload((value) => value + 1);
    setDetailReload((value) => value + 1);
  }, []);

  const goToNextPage = useCallback(() => {
    if (!state.page) return;
    dispatch({
      type: 'offset_changed',
      offset: nextReviewOffset(state.offset, state.page.limit, state.page.total),
    });
  }, [state.offset, state.page]);

  const goToPreviousPage = useCallback(() => {
    dispatch({
      type: 'offset_changed',
      offset: previousReviewOffset(state.offset, state.page?.limit ?? PAGE_SIZE),
    });
  }, [state.offset, state.page]);

  return {
    canGoNext: Boolean(state.page && state.page.offset + state.page.items.length < state.page.total),
    canGoPrevious: state.offset > 0,
    changeFilters,
    clearSelection,
    dispatch: dispatch as React.Dispatch<ReviewWorkspaceEvent>,
    goToNextPage,
    goToPreviousPage,
    refreshAll,
    retryDetail,
    retryList,
    select,
    state,
  };
}
