import { useCallback } from 'react';
import type { ReviewFilters } from '../types';
import { useReviewActions } from './use-review-actions';
import { useReviewData } from './use-review-data';

export function useReviews(reviewerId: string) {
  const data = useReviewData();
  const actions = useReviewActions({ dispatch: data.dispatch, refreshAll: data.refreshAll });

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
    state: data.state,
  };
}
