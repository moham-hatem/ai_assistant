import { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language';
import { reviewsCopies } from '../copy';
import { ReviewDetails } from '../components/ReviewDetails';
import { ReviewFilters } from '../components/ReviewFilters';
import { ReviewQueue } from '../components/ReviewQueue';
import { useReviews } from '../hooks/use-reviews';
import type { AuthPrincipal } from '../../../../../shared/contracts/auth';
import { canApproveContentReview } from '../../../auth/permissions';
import { reviewerIdFromPrincipal } from '../reviewer-session';

export function ReviewsWorkspace({ language, principal }: { language: AppLanguage; principal: AuthPrincipal }) {
  const copy = reviewsCopies[language];
  const reviews = useReviews(reviewerIdFromPrincipal(principal));
  const canManage = canApproveContentReview(principal);
  const detailPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!reviews.state.selectedId || reviews.state.detailStatus === 'idle') return;
    if (window.matchMedia('(max-width: 980px)').matches) {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [reviews.state.detailStatus, reviews.state.selectedId]);

  const detail = reviews.state.detail;
  return (
    <div className="reviews-workspace">
      <ReviewFilters copy={copy} filters={reviews.state.filters} onChange={reviews.setFilters} />
      {(reviews.state.successKind || reviews.state.mutationError) && (
        <button className={`review-feedback ${reviews.state.mutationError ? 'is-error' : 'is-success'}`} onClick={reviews.clearFeedback} type="button">
          {reviews.state.mutationError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{feedbackMessage(copy, reviews.state.successKind, reviews.state.mutationError)}</span>
        </button>
      )}
      <div className="reviews-grid">
        <ReviewQueue
          canGoNext={reviews.canGoNext}
          canGoPrevious={reviews.canGoPrevious}
          copy={copy}
          language={language}
          onNext={reviews.goToNextPage}
          onPrevious={reviews.goToPreviousPage}
          onRefresh={reviews.retryList}
          onSelect={reviews.select}
          page={reviews.state.page}
          selectedId={reviews.state.selectedId}
          status={reviews.state.listStatus}
        />
        <ReviewDetails
          busy={reviews.state.mutationStatus === 'submitting'}
          canManage={canManage}
          copy={copy}
          detail={detail}
          language={language}
          onClaim={() => detail && reviews.claim(detail.item.id, reviews.reviewerId)}
          onClose={reviews.clearSelection}
          onDecide={(request) => detail && reviews.decide(detail.item.id, request)}
          onRelease={() => detail && reviews.release(detail.item.id, reviews.reviewerId)}
          onRetry={reviews.retryDetail}
          panelRef={detailPanelRef}
          reviewerId={reviews.reviewerId}
          selectedId={reviews.state.selectedId}
          status={reviews.state.detailStatus}
        />
      </div>
    </div>
  );
}
function feedbackMessage(
  copy: (typeof reviewsCopies)[AppLanguage],
  success: 'claim' | 'release' | 'decision' | null,
  error: 'conflict' | 'generic' | null,
): string {
  if (error) return error === 'conflict' ? copy.actionConflict : copy.actionError;
  if (success === 'claim') return copy.successClaim;
  if (success === 'release') return copy.successRelease;
  return copy.successDecision;
}
