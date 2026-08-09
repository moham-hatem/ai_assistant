import { AlertCircle, FileQuestion, LoaderCircle, X } from 'lucide-react';
import type { Ref, ReactNode } from 'react';
import type { AppLanguage } from '../../../../i18n/language';
import type { ReviewsCopy } from '../copy';
import { formatReviewDate, formatReviewLanguage } from '../format';
import type { LoadStatus, ReviewDecisionRequest, ReviewDetail } from '../types';
import { ReviewActions } from './ReviewActions';
import { ReviewChannelBadge, ReviewStatusBadge } from './ReviewBadge';
import { ReviewDecisionSummary } from './ReviewDecisionSummary';
import { ReviewState } from './ReviewState';
import { ReviewTimeline } from './ReviewTimeline';

interface ReviewDetailsProps {
  busy: boolean;
  canManage: boolean;
  copy: ReviewsCopy;
  detail: ReviewDetail | null;
  language: AppLanguage;
  onClaim: () => void;
  onClose: () => void;
  onDecide: (request: ReviewDecisionRequest) => void;
  onRelease: () => void;
  onRetry: () => void;
  panelRef?: Ref<HTMLElement>;
  reviewerId: string;
  selectedId: string | null;
  status: LoadStatus;
}
export function ReviewDetails(props: ReviewDetailsProps) {
  return (
    <aside className="review-detail-panel" aria-labelledby="review-detail-title" ref={props.panelRef}>
      <header className="review-panel-header">
        <strong id="review-detail-title">{props.copy.details}</strong>
        {props.selectedId && <button className="review-icon-button" onClick={props.onClose} title={props.copy.closeDetails} type="button"><X size={18} /><span className="sr-only">{props.copy.closeDetails}</span></button>}
      </header>
      {!props.selectedId && <ReviewState body={props.copy.chooseReviewBody} icon={<FileQuestion size={25} />} title={props.copy.chooseReviewTitle} />}
      {props.selectedId && props.status === 'loading' && <ReviewState icon={<LoaderCircle className="is-spinning" size={24} />} title={props.copy.loadingDetails} />}
      {props.selectedId && props.status === 'error' && <ReviewState action={<button className="review-secondary-button" onClick={props.onRetry} type="button">{props.copy.retry}</button>} icon={<AlertCircle size={24} />} title={props.copy.loadDetailsError} />}
      {props.selectedId && props.status === 'ready' && props.detail && <ReviewDetailContent {...props} detail={props.detail} />}
    </aside>
  );
}

function ReviewDetailContent(props: ReviewDetailsProps & { detail: ReviewDetail }) {
  const { copy, detail, language } = props;
  const log = detail.questionLog;
  return (
    <div className="review-detail-content">
      <section className="review-detail-question">
        <span className="review-badges"><ReviewStatusBadge copy={copy} status={detail.item.status} /><ReviewChannelBadge channel={log.channel} /></span>
        <small>{copy.question}</small>
        <h2 dir="auto">{log.question}</h2>
      </section>
      <DetailSection title={copy.answer}>
        <p className="review-long-text" dir="auto">{log.answer ?? log.apology ?? copy.notAvailable}</p>
      </DetailSection>
      <DetailSection title={copy.evidence}>
        {log.evidenceReferences.length > 0 ? (
          <ul className="review-evidence-list">
            {log.evidenceReferences.map((reference, index) => <li dir="auto" key={`${reference}-${index}`}>{reference}</li>)}
          </ul>
        ) : <p className="review-muted">{copy.noEvidence}</p>}
      </DetailSection>
      <DetailSection title={copy.metadata}>
        <dl className="review-metadata">
          <Metadata label={copy.status} value={copy.statuses[detail.item.status]} />
          <Metadata label={copy.assignedReviewer} value={<bdi>{detail.item.assignedReviewerId ?? copy.unassigned}</bdi>} />
          <Metadata label={copy.answerLanguage} value={formatReviewLanguage(log.answerLanguage, language)} />
          <Metadata label={copy.channel} value={<bdi>{log.channel}</bdi>} />
          <Metadata label={copy.provider} value={<bdi>{log.provider ?? copy.notAvailable}</bdi>} />
          <Metadata label={copy.model} value={<bdi>{log.model ?? copy.notAvailable}</bdi>} />
          <Metadata label={copy.grounded} value={log.grounded === null ? copy.unknown : log.grounded ? copy.yes : copy.no} />
          <Metadata label={copy.sufficiency} value={copy.sufficiencies[log.sufficiency]} />
          <Metadata label={copy.createdAt} value={<time dateTime={detail.item.createdAt}>{formatReviewDate(detail.item.createdAt, language)}</time>} />
          <Metadata label={copy.updatedAt} value={<time dateTime={detail.item.updatedAt}>{formatReviewDate(detail.item.updatedAt, language)}</time>} />
          {detail.item.decidedAt && <Metadata label={copy.decidedAt} value={<time dateTime={detail.item.decidedAt}>{formatReviewDate(detail.item.decidedAt, language)}</time>} />}
        </dl>
      </DetailSection>
      {props.canManage && <ReviewActions busy={props.busy} copy={copy} detail={detail} onClaim={props.onClaim} onDecide={props.onDecide} onRelease={props.onRelease} reviewerId={props.reviewerId} />}
      <ReviewDecisionSummary copy={copy} decision={detail.decision} />
      <ReviewTimeline copy={copy} events={detail.events} language={language} />
    </div>
  );
}

function DetailSection({ children, title }: { children: ReactNode; title: string }) {
  return <section className="review-detail-section"><h3>{title}</h3>{children}</section>;
}

function Metadata({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
