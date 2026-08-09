import { useState } from 'react';
import { CheckCircle2, TriangleAlert, X } from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language';
import { KnowledgeManager } from '../../../knowledge/containers/KnowledgeManager';
import { BookDetails } from '../components/BookDetails';
import { BooksList } from '../components/BooksList';
import { TransitionDialog } from '../components/TransitionDialog';
import { booksCopies } from '../copy';
import { useBookEditionUpload } from '../hooks/useBookEditionUpload';
import { useBooks } from '../hooks/useBooks';
import { useEditionProcessing } from '../hooks/useEditionProcessing';
import type { PendingTransition } from '../types';

interface BooksWorkspaceProps { canReview: boolean; canWrite: boolean; language: AppLanguage }

export function BooksWorkspace({ canReview, canWrite, language }: BooksWorkspaceProps) {
  const books = useBooks();
  const copy = booksCopies[language];
  const upload = useBookEditionUpload(books.selectedId, books.synchronizeUpload);
  const processing = useEditionProcessing(
    books.selectedId,
    books.editions?.items ?? [],
    books.synchronizeProcessingApproval,
  );
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const errorMessage = books.transitionError === 'refresh'
    ? copy.transitionRefreshError
    : copy.transitionError;

  async function confirmTransition() {
    if (!pending) return;
    const updated = await books.runTransition(pending.edition.id, pending.targetStatus);
    setPending(null);
    if (updated) setSuccess(copy.transitionSuccess(updated.version, copy.statuses[updated.status]));
  }

  function requestTransition(transition: PendingTransition) {
    setSuccess(null);
    setPending(transition);
  }

  function selectBook(id: string) {
    setPending(null);
    setSuccess(null);
    books.select(id);
  }

  return (
    <>
      {(success || books.transitionError) && (
        <div className={`books-notice ${books.transitionError ? 'is-error' : 'is-success'}`} role={books.transitionError ? 'alert' : 'status'}>
          {books.transitionError ? <TriangleAlert size={19} /> : <CheckCircle2 size={19} />}
          <span>{books.transitionError ? errorMessage : success}</span>
          {success && <button aria-label={copy.cancel} onClick={() => setSuccess(null)} type="button"><X size={16} /></button>}
        </div>
      )}
      <div className="books-workspace">
        <BooksList
          canGoNext={books.canGoNext}
          canGoPrevious={books.canGoPrevious}
          copy={copy}
          language={language}
          onNext={books.goToNextPage}
          onPrevious={books.goToPreviousPage}
          onRefresh={books.retryList}
          onSelect={selectBook}
          page={books.page}
          selectedId={books.selectedId}
          status={books.listStatus}
        />
        <BookDetails
          book={books.book}
          canWrite={canWrite}
          canReview={canReview}
          canGoNext={books.canEditionsGoNext}
          canGoPrevious={books.canEditionsGoPrevious}
          copy={copy}
          editions={books.editions}
          language={language}
          onNext={books.goToEditionsNextPage}
          onPrevious={books.goToEditionsPreviousPage}
          onRetry={books.retryDetail}
          onTransition={requestTransition}
          onUpload={upload.upload}
          processing={processing}
          selectedId={books.selectedId}
          status={books.detailStatus}
          transitioningId={books.transitioningId}
          uploadState={upload}
        />
      </div>
      <section className="legacy-files-panel">
        <header><div><span>{copy.legacyBadge}</span><h2>{copy.legacyTitle}</h2></div><p>{copy.legacyBody}</p></header>
        <KnowledgeManager canWrite={canWrite} language={language} />
      </section>
      {pending && <TransitionDialog busy={books.transitioningId === pending.edition.id} copy={copy} onCancel={() => setPending(null)} onConfirm={() => void confirmTransition()} pending={pending} />}
    </>
  );
}
