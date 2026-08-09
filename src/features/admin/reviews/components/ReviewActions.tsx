import { Check, Hand, PencilLine, RotateCcw, ShieldX, Wrench } from 'lucide-react';
import { useState } from 'react';
import type { ReviewsCopy } from '../copy';
import { isUsableReviewerId } from '../reviewer-session';
import type { DecisionMode, ReviewDecisionRequest, ReviewDetail } from '../types';
import { ReviewDecisionDialog } from './ReviewDecisionDialog';

interface ReviewActionsProps {
  busy: boolean;
  copy: ReviewsCopy;
  detail: ReviewDetail;
  onClaim: () => void;
  onDecide: (request: ReviewDecisionRequest) => void;
  onRelease: () => void;
  reviewerId: string;
}

export function ReviewActions(props: ReviewActionsProps) {
  const [mode, setMode] = useState<DecisionMode | null>(null);
  const reviewerId = props.reviewerId.trim();
  const item = props.detail.item;
  const hasReviewer = isUsableReviewerId(reviewerId);
  const ownsReview = item.status === 'in_review' && item.assignedReviewerId === reviewerId;
  const canDecide = hasReviewer && (item.status === 'pending' || ownsReview);
  const isFinal = !['pending', 'in_review'].includes(item.status);

  if (isFinal) return null;

  return (
    <section className="review-detail-section review-actions-section">
      <h3>{props.copy.decision}</h3>
      <div className="review-actions">
          {item.status === 'pending' && <ActionButton disabled={!hasReviewer || props.busy} icon={<Hand size={17} />} label={props.copy.claim} onClick={props.onClaim} />}
          {item.status === 'in_review' && <ActionButton disabled={!ownsReview || props.busy} icon={<RotateCcw size={17} />} label={props.copy.release} onClick={props.onRelease} />}
          <ActionButton disabled={!canDecide || props.busy} icon={<Check size={17} />} label={props.copy.approveAsIs} onClick={() => setMode('approve_as_is')} />
          <ActionButton disabled={!canDecide || props.busy} icon={<PencilLine size={17} />} label={props.copy.approveEdited} onClick={() => setMode('approve_edited')} />
          <ActionButton danger disabled={!canDecide || props.busy} icon={<ShieldX size={17} />} label={props.copy.reject} onClick={() => setMode('reject')} />
          <ActionButton disabled={!canDecide || props.busy} icon={<Wrench size={17} />} label={props.copy.needsChanges} onClick={() => setMode('needs_changes')} />
      </div>
      {!canDecide && item.status === 'in_review' && <p className="review-muted">{props.copy.actionUnavailable}</p>}
      {mode && (
        <ReviewDecisionDialog
          copy={props.copy}
          initialAnswer={props.detail.questionLog.answer ?? ''}
          key={mode}
          mode={mode}
          onClose={() => setMode(null)}
          onConfirm={props.onDecide}
          reviewerId={props.reviewerId}
        />
      )}
    </section>
  );
}

function ActionButton({ danger = false, disabled, icon, label, onClick }: {
  danger?: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return <button className={`review-action-button${danger ? ' is-danger' : ''}`} disabled={disabled} onClick={onClick} type="button">{icon}{label}</button>;
}
