import { Archive, CheckCircle2, Clock3, FileCheck2, RotateCcw, Send, XCircle } from 'lucide-react';
import { allowedEditionTransitions } from '../../../../../shared/contracts/books';
import type { AppLanguage } from '../../../../i18n/language';
import type { BooksCopy } from '../copy';
import { formatBookDate } from '../format';
import type { BookEdition, EditionStatus } from '../types';

const actionIcons = {
  archived: Archive,
  draft: RotateCcw,
  processing: Clock3,
  published: Send,
  ready: CheckCircle2,
  rejected: XCircle,
};

interface EditionCardProps {
  copy: BooksCopy;
  edition: BookEdition;
  language: AppLanguage;
  onTransition: (edition: BookEdition, target: EditionStatus) => void;
  transitioning: boolean;
}

export function EditionCard({ copy, edition, language, onTransition, transitioning }: EditionCardProps) {
  const transitions = allowedEditionTransitions(edition.status);
  return (
    <article className="edition-card">
      <header>
        <span className="edition-icon"><FileCheck2 size={19} /></span>
        <div><small>{copy.version}</small><h3 dir="auto">{edition.version}</h3></div>
        <span className={`edition-status status-${edition.status}`}>{copy.statuses[edition.status]}</span>
      </header>
      <dl className="edition-metadata">
        <div><dt>{copy.createdAt}</dt><dd><time dateTime={edition.createdAt}>{formatBookDate(edition.createdAt, language)}</time></dd></div>
        <div><dt>{copy.publishedAt}</dt><dd>{edition.publishedAt ? <time dateTime={edition.publishedAt}>{formatBookDate(edition.publishedAt, language)}</time> : copy.notAvailable}</dd></div>
        <div><dt>{copy.archivedAt}</dt><dd>{edition.archivedAt ? <time dateTime={edition.archivedAt}>{formatBookDate(edition.archivedAt, language)}</time> : copy.notAvailable}</dd></div>
        <div className="edition-reference"><dt>{copy.reference}</dt><dd dir="auto">{edition.originalDocumentReference}</dd></div>
        <div className="edition-fingerprint"><dt>{copy.fingerprint}</dt><dd dir="ltr"><code>{edition.contentHash}</code></dd></div>
      </dl>
      {transitions.length > 0 && (
        <footer className="edition-actions">
          {transitions.map((target) => {
            const Icon = actionIcons[target];
            return (
              <button disabled={transitioning} key={target} onClick={() => onTransition(edition, target)} type="button">
                <Icon size={16} />{copy.actions[target]}
              </button>
            );
          })}
        </footer>
      )}
    </article>
  );
}
