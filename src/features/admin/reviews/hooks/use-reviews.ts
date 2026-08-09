import { useCallback, useState } from 'react';
import { readReviewerId, saveReviewerId } from '../reviewer-session';
import type { ReviewFilters } from '../types';
import { useReviewActions } from './use-review-actions';
import { useReviewData } from './use-review-data';

export function useReviews() {
  const data = useReviewData();
  const actions = useReviewActions({ dispatch: data.dispatch, refreshAll: data.refreshAll });
  const [reviewerId, setReviewerIdState] = useState(readReviewerId);

  const setReviewerId = useCallback((value: string) => {
    setReviewerIdState(value);
    saveReviewerId(value);
  }, []);

  const setFilters = useCallback((filters: ReviewFilters) => {
    data.changeFilters(filters);
  }, [data.changeFilters]);

  return {
    ...actions,
    canGoNext: data.canGoNext,
    canGoPrevious: data.canGoPrevious,
    clearSelection: data.clearSelection,
    goToNextPage: data.goToNextPage,
    goToPreviousPage: data.goToPreviousPage,
    retryDetail: data.retryDetail,
    retryList: data.retryList,
    reviewerId,
    select: data.select,
    setFilters,
    setReviewerId,
    state: data.state,
  };
}
