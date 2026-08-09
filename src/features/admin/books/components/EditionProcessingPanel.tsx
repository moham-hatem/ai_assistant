import {
  AlertTriangle,
  Eye,
  FileText,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language.ts';
import { availableProcessingActions } from '../processing-action-availability.ts';
import type { ProcessingCopy } from '../processing-copy.ts';
import {
  formatProcessingConfidence,
  formatProcessingCount,
  formatProcessingDate,
} from '../processing-format.ts';
import { documentIdFromReference, safeDocumentFailureCode } from '../processing-state.ts';
import type { BookEdition, EditionProcessingEntry } from '../types.ts';

type PreviewResource = 'source' | 'text';

interface EditionProcessingPanelProps {
  canReview: boolean;
  canWrite: boolean;
  copy: ProcessingCopy;
  edition: BookEdition;
  entry?: EditionProcessingEntry;
  language: AppLanguage;
  notAvailable: string;
  onApprove: () => void;
  onPreview: (documentId: string, resource: PreviewResource) => void;
  onReprocess: () => void;
  onRetry: () => void;
}

export function EditionProcessingPanel(props: EditionProcessingPanelProps) {
  const { copy, edition, entry, language } = props;
  const documentId = documentIdFromReference(edition.originalDocumentReference);

  if (!entry || (entry.phase === 'loading' && !entry.processing)) {
    return (
      <section aria-busy="true" className="edition-processing-panel processing-panel-state">
        <LoaderCircle aria-hidden="true" className="processing-spinner" size={17} />
        <span>{copy.loading}</span>
      </section>
    );
  }
  if (entry.phase === 'error' && !entry.processing) {
    return (
      <section className="edition-processing-panel processing-panel-state is-error">
        <AlertTriangle aria-hidden="true" size={17} />
        <span>{copy.loadError}</span>
        <button onClick={props.onRetry} type="button">{copy.retry}</button>
      </section>
    );
  }

  const processing = entry.processing;
  if (!processing) return null;
  const { summary } = processing;
  const actions = availableProcessingActions(edition.status, summary.status);
  const safeFailureCode = safeDocumentFailureCode(summary.failureCode);
  const busy = entry.action !== null;

  return (
    <section aria-busy={busy} aria-label={copy.processingDetails} className="edition-processing-panel">
      <header>
        <strong>{copy.processingDetails}</strong>
        <span className={`processing-status processing-status-${summary.status}`}>
          {copy.statuses[summary.status]}
        </span>
      </header>
      <dl className="processing-metrics">
        <Metric label={copy.method} value={copy.methods[summary.method]} />
        <Metric label={copy.pageCount} value={formatProcessingCount(summary.pageCount, language)} />
        <Metric label={copy.ocrPages} value={formatProcessingCount(summary.ocrPageCount, language)} />
        <Metric label={copy.lowConfidencePages} value={formatProcessingCount(summary.lowConfidencePageCount, language)} />
        <Metric label={copy.averageConfidence} value={formatProcessingConfidence(summary.averageConfidence, language, props.notAvailable)} />
        <Metric label={copy.processedAt} value={formatProcessingDate(summary.processedAt, language, props.notAvailable)} />
        {(summary.failureCode || summary.status === 'failed') && (
          <div className="processing-failure-code">
            <dt>{copy.failureCode}</dt>
            <dd dir="ltr"><code>{safeFailureCode ?? copy.unknownFailureCode}</code></dd>
          </div>
        )}
      </dl>
      <footer className="processing-actions">
        {documentId && (
          <>
            <button disabled={busy} onClick={() => props.onPreview(documentId, 'source')} type="button">
              <Eye aria-hidden="true" size={16} />{copy.previewSource}
            </button>
            <button disabled={busy} onClick={() => props.onPreview(documentId, 'text')} type="button">
              <FileText aria-hidden="true" size={16} />{copy.previewExtractedText}
            </button>
          </>
        )}
        {props.canWrite && actions.includes('reprocess') && (
          <button disabled={busy} onClick={props.onReprocess} type="button">
            {entry.action === 'reprocess'
              ? <LoaderCircle aria-hidden="true" className="processing-spinner" size={16} />
              : <RefreshCw aria-hidden="true" size={16} />}
            {entry.action === 'reprocess' ? copy.reprocessing : copy.reprocess}
          </button>
        )}
        {props.canReview && actions.includes('approve') && (
          <button className="processing-approve" disabled={busy} onClick={props.onApprove} type="button">
            {entry.action === 'approve'
              ? <LoaderCircle aria-hidden="true" className="processing-spinner" size={16} />
              : <ShieldCheck aria-hidden="true" size={16} />}
            {entry.action === 'approve' ? copy.approving : copy.approve}
          </button>
        )}
      </footer>
      {edition.status === 'published' && <p className="processing-lock-note">{copy.publishedLocked}</p>}
      {entry.actionError && (
        <p className="processing-action-error" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />{copy.actionErrors[entry.actionError]}
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
