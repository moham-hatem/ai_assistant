import { AlertCircle, FileQuestion, LoaderCircle, X } from 'lucide-react';
import type { Ref } from 'react';
import type { AppLanguage } from '../../../../i18n/language';
import type { QuestionLogsCopy } from '../copy';
import { formatDateTime, formatLanguageName, formatLatency } from '../format';
import type { LoadStatus, QuestionLogRecord } from '../types';
import { QuestionLogBadges } from './QuestionLogBadges';
import { QuestionLogState } from './QuestionLogState';

interface QuestionLogDetailsProps {
  copy: QuestionLogsCopy;
  language: AppLanguage;
  onClose: () => void;
  onRetry: () => void;
  panelRef?: Ref<HTMLElement>;
  record: QuestionLogRecord | null;
  selectedId: string | null;
  status: LoadStatus;
}

export function QuestionLogDetails({
  copy,
  language,
  onClose,
  onRetry,
  panelRef,
  record,
  selectedId,
  status,
}: QuestionLogDetailsProps) {
  return (
    <aside className="question-log-detail-panel" aria-labelledby="question-log-detail-title" ref={panelRef}>
      <header className="question-log-panel-header">
        <strong id="question-log-detail-title">{copy.details}</strong>
        {selectedId && (
          <button className="question-log-icon-button" onClick={onClose} title={copy.closeDetails} type="button">
            <X aria-hidden="true" size={18} />
            <span className="sr-only">{copy.closeDetails}</span>
          </button>
        )}
      </header>

      {!selectedId && (
        <QuestionLogState body={copy.chooseRecordBody} icon={<FileQuestion size={25} />} title={copy.chooseRecordTitle} />
      )}
      {selectedId && status === 'loading' && (
        <QuestionLogState icon={<LoaderCircle className="is-spinning" size={24} />} title={copy.loadingDetails} />
      )}
      {selectedId && status === 'error' && (
        <QuestionLogState
          action={<button className="question-log-action" onClick={onRetry} type="button">{copy.retry}</button>}
          icon={<AlertCircle size={24} />}
          title={copy.loadDetailsError}
        />
      )}
      {selectedId && status === 'ready' && record && (
        <div className="question-log-detail-content">
          <section className="question-log-detail-question">
            <QuestionLogBadges copy={copy} record={record} />
            <small>{copy.question}</small>
            <h2 dir="auto">{record.question}</h2>
          </section>

          <DetailSection title={copy.result}>
            <small>{record.answer === null ? copy.apology : copy.answer}</small>
            <p className="question-log-long-text" dir="auto">{record.answer ?? record.apology ?? copy.notAvailable}</p>
          </DetailSection>

          <DetailSection title={copy.evidence}>
            {record.evidenceReferences.length > 0 ? (
              <ul className="question-log-evidence-list">
                {record.evidenceReferences.map((reference) => <li dir="ltr" key={reference}>{reference}</li>)}
              </ul>
            ) : <p className="question-log-muted">{copy.noEvidence}</p>}
          </DetailSection>

          <DetailSection title={copy.metadata}>
            <dl className="question-log-metadata">
              <MetadataItem label={copy.startedAt} value={<time dateTime={record.startedAt}>{formatDateTime(record.startedAt, language)}</time>} />
              <MetadataItem label={copy.completedAt} value={<time dateTime={record.completedAt}>{formatDateTime(record.completedAt, language)}</time>} />
              <MetadataItem label={copy.latency} value={formatLatency(record.latencyMs, language)} />
              <MetadataItem label={copy.language} value={formatLanguageName(record.answerLanguage, language)} />
              <MetadataItem label={copy.channel} value={copy.channels[record.channel]} />
              <MetadataItem label={copy.status} value={copy.statuses[record.status]} />
              <MetadataItem label={copy.provider} value={<bdi>{record.provider ?? copy.notAvailable}</bdi>} />
              <MetadataItem label={copy.model} value={<bdi>{record.model ?? copy.notAvailable}</bdi>} />
              <MetadataItem label={copy.grounded} value={record.grounded === null ? copy.unknown : record.grounded ? copy.yes : copy.no} />
              <MetadataItem label={copy.sufficiency} value={copy.sufficiencies[record.sufficiency]} />
            </dl>
          </DetailSection>
        </div>
      )}
    </aside>
  );
}

function DetailSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="question-log-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function MetadataItem({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
