import { useCallback, useRef } from 'react';
import type { ReviewDetail, ReviewItem } from '../../../../../shared/contracts/reviews';
import { createActionLock } from '../action-lock';
import { changeReviewStatus, ReviewsApiError, saveReviewDecision } from '../api/reviews';
import { validateReviewerId } from '../review-actions';
import type { ReviewWorkspaceEvent } from '../reviews-state';
import type { ReviewDecisionRequest } from '../types';

interface ReviewActionsOptions {
  dispatch: React.Dispatch<ReviewWorkspaceEvent>;
  refreshAll: () => void;
}

interface MutationResult {
  detail?: ReviewDetail;
  item?: ReviewItem;
}

export function useReviewActions({ dispatch, refreshAll }: ReviewActionsOptions) {
  const lock = useRef(createActionLock());

  const runMutation = useCallback(async (
    kind: 'claim' | 'release' | 'decision',
    reviewId: string,
    operation: () => Promise<MutationResult>,
  ) => {
    if (lock.current.isActive()) return;
    await lock.current.run(async () => {
      dispatch({ type: 'mutation_started' });
      try {
        const result = await operation();
        dispatch({ type: 'mutation_succeeded', ...result, kind, reviewId });
      } catch (error) {
        dispatch({
          type: 'mutation_failed',
          error: error instanceof ReviewsApiError && error.status === 409 ? 'conflict' : 'generic',
        });
      } finally {
        refreshAll();
      }
    });
  }, [dispatch, refreshAll]);

  const claim = useCallback((reviewId: string, reviewerValue: string) => {
    let reviewerId: string;
    try {
      reviewerId = validateReviewerId(reviewerValue);
    } catch {
      dispatch({ type: 'mutation_failed', error: 'generic' });
      return;
    }
    void runMutation('claim', reviewId, async () => {
      const item = await changeReviewStatus(reviewId, { reviewerId, status: 'in_review' });
      return { item };
    });
  }, [dispatch, runMutation]);

  const release = useCallback((reviewId: string, reviewerValue: string) => {
    let reviewerId: string;
    try {
      reviewerId = validateReviewerId(reviewerValue);
    } catch {
      dispatch({ type: 'mutation_failed', error: 'generic' });
      return;
    }
    void runMutation('release', reviewId, async () => {
      const item = await changeReviewStatus(reviewId, { reviewerId, status: 'pending' });
      return { item };
    });
  }, [dispatch, runMutation]);

  const decide = useCallback((reviewId: string, request: ReviewDecisionRequest) => {
    void runMutation('decision', reviewId, async () => ({
      detail: await saveReviewDecision(reviewId, request),
    }));
  }, [runMutation]);

  const clearFeedback = useCallback(() => dispatch({ type: 'feedback_cleared' }), [dispatch]);

  return { claim, clearFeedback, decide, release };
}
