import { useCallback, useEffect, useState } from 'react';
import { fetchBook, fetchBooks, fetchEditions, transitionEdition } from '../api/books';
import { nextOffset, previousOffset, replaceEdition } from '../books-state';
import type { Book, BookPage, EditionPage, EditionStatus, LoadStatus } from '../types';

const bookPageSize = 12;
const editionPageSize = 100;

export function useBooks() {
  const [book, setBook] = useState<Book | null>(null);
  const [detailReload, setDetailReload] = useState(0);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>('idle');
  const [editions, setEditions] = useState<EditionPage | null>(null);
  const [listReload, setListReload] = useState(0);
  const [listStatus, setListStatus] = useState<LoadStatus>('loading');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<BookPage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState(false);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setListStatus('loading');
    void fetchBooks(bookPageSize, offset, controller.signal).then((nextPage) => {
      if (controller.signal.aborted) return;
      if (nextPage.items.length === 0 && offset > 0 && nextPage.total > 0) {
        setOffset(previousOffset(offset, bookPageSize));
        return;
      }
      setPage(nextPage);
      setSelectedId((current) => current && nextPage.items.some(({ id }) => id === current)
        ? current
        : nextPage.items[0]?.id ?? null);
      setListStatus('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setListStatus('error');
    });
    return () => controller.abort();
  }, [listReload, offset]);

  useEffect(() => {
    if (!selectedId) {
      setBook(null);
      setEditions(null);
      setDetailStatus('idle');
      return;
    }
    const controller = new AbortController();
    setDetailStatus('loading');
    setTransitionError(false);
    void Promise.all([
      fetchBook(selectedId, controller.signal),
      fetchEditions(selectedId, editionPageSize, 0, controller.signal),
    ]).then(([nextBook, nextEditions]) => {
      if (controller.signal.aborted) return;
      setBook(nextBook);
      setEditions(nextEditions);
      setDetailStatus('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setDetailStatus('error');
    });
    return () => controller.abort();
  }, [detailReload, selectedId]);

  const runTransition = useCallback(async (editionId: string, target: EditionStatus) => {
    if (!selectedId || transitioningId) return null;
    setTransitionError(false);
    setTransitioningId(editionId);
    try {
      const updated = await transitionEdition(selectedId, editionId, target);
      setEditions((current) => current
        ? { ...current, items: replaceEdition(current.items, updated) }
        : current);
      return updated;
    } catch {
      setTransitionError(true);
      return null;
    } finally {
      setTransitioningId(null);
    }
  }, [selectedId, transitioningId]);

  return {
    book, canGoNext: Boolean(page && page.offset + page.items.length < page.total),
    canGoPrevious: offset > 0, detailStatus, editions,
    goToNextPage: () => page && setOffset(nextOffset(offset, page.limit, page.total)),
    goToPreviousPage: () => setOffset(previousOffset(offset, page?.limit ?? bookPageSize)),
    listStatus, page, retryDetail: () => setDetailReload((value) => value + 1),
    retryList: () => setListReload((value) => value + 1), runTransition,
    select: setSelectedId, selectedId, transitionError, transitioningId,
  };
}
