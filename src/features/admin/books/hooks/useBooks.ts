import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBookDetailPage } from '../api/book-detail';
import { fetchBooks, transitionEdition } from '../api/books';
import { isCurrentBookRequest, nextOffset, previousOffset, replaceBook } from '../books-state';
import type { Book, BookPage, EditionPage, EditionStatus, LoadStatus } from '../types';

const bookPageSize = 12;
const editionPageSize = 8;

export function useBooks() {
  const [book, setBook] = useState<Book | null>(null);
  const [detailReload, setDetailReload] = useState(0);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>('idle');
  const [editionOffset, setEditionOffset] = useState(0);
  const [editions, setEditions] = useState<EditionPage | null>(null);
  const [listReload, setListReload] = useState(0);
  const [listStatus, setListStatus] = useState<LoadStatus>('loading');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<BookPage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState(false);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const editionOffsetRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const transitioningIdRef = useRef<string | null>(null);

  const select = useCallback((id: string | null) => {
    if (selectedIdRef.current === id) return;
    selectedIdRef.current = id;
    editionOffsetRef.current = 0;
    setSelectedId(id);
    setEditionOffset(0);
    setBook(null);
    setEditions(null);
    setDetailStatus(id ? 'loading' : 'idle');
    setTransitionError(false);
  }, []);

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
      const current = selectedIdRef.current;
      if (!current || !nextPage.items.some(({ id }) => id === current)) {
        select(nextPage.items[0]?.id ?? null);
      }
      setListStatus('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setListStatus('error');
    });
    return () => controller.abort();
  }, [listReload, offset, select]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const requestedBookId = selectedId;
    const requestedOffset = editionOffset;
    setBook(null);
    setEditions(null);
    setDetailStatus('loading');
    setTransitionError(false);
    void fetchBookDetailPage(
      requestedBookId,
      editionPageSize,
      requestedOffset,
      controller.signal,
    ).then((detail) => {
      if (controller.signal.aborted || !isCurrentRequest(requestedBookId, requestedOffset)) return;
      if (detail.editions.items.length === 0 && requestedOffset > 0 && detail.editions.total > 0) {
        changeEditionOffset(previousOffset(requestedOffset, detail.editions.limit));
        return;
      }
      applyDetail(detail.book, detail.editions);
    }).catch(() => {
      if (!controller.signal.aborted && isCurrentRequest(requestedBookId, requestedOffset)) {
        setDetailStatus('error');
      }
    });
    return () => controller.abort();
  }, [detailReload, editionOffset, selectedId]);

  function isCurrentRequest(bookId: string, requestedOffset: number): boolean {
    return isCurrentBookRequest(
      selectedIdRef.current,
      bookId,
      editionOffsetRef.current,
      requestedOffset,
    );
  }

  function changeEditionOffset(next: number) {
    editionOffsetRef.current = next;
    setEditionOffset(next);
  }

  function applyDetail(nextBook: Book, nextEditions: EditionPage) {
    setBook(nextBook);
    setEditions(nextEditions);
    setPage((current) => current
      ? { ...current, items: replaceBook(current.items, nextBook) }
      : current);
    setDetailStatus('ready');
  }

  const runTransition = useCallback(async (editionId: string, target: EditionStatus) => {
    const bookId = selectedIdRef.current;
    const requestedOffset = editionOffsetRef.current;
    if (!bookId || transitioningIdRef.current) return null;
    transitioningIdRef.current = editionId;
    setTransitionError(false);
    setTransitioningId(editionId);
    try {
      const updated = await transitionEdition(bookId, editionId, target);
      if (!isCurrentRequest(bookId, requestedOffset)) return null;
      setBook(null);
      setEditions(null);
      setDetailStatus('loading');
      const detail = await fetchBookDetailPage(bookId, editionPageSize, requestedOffset);
      if (!isCurrentRequest(bookId, requestedOffset)) return null;
      applyDetail(detail.book, detail.editions);
      return updated;
    } catch {
      if (isCurrentRequest(bookId, requestedOffset)) setTransitionError(true);
      return null;
    } finally {
      transitioningIdRef.current = null;
      setTransitioningId(null);
    }
  }, []);

  function goToBookPage(next: number) {
    if (next === offset) return;
    select(null);
    setOffset(next);
  }

  return {
    book, canEditionsGoNext: Boolean(editions && editions.offset + editions.items.length < editions.total),
    canEditionsGoPrevious: editionOffset > 0,
    canGoNext: Boolean(page && page.offset + page.items.length < page.total),
    canGoPrevious: offset > 0, detailStatus, editions,
    goToEditionsNextPage: () => editions && changeEditionOffset(nextOffset(editionOffset, editions.limit, editions.total)),
    goToEditionsPreviousPage: () => changeEditionOffset(previousOffset(editionOffset, editions?.limit ?? editionPageSize)),
    goToNextPage: () => page && goToBookPage(nextOffset(offset, page.limit, page.total)),
    goToPreviousPage: () => goToBookPage(previousOffset(offset, page?.limit ?? bookPageSize)),
    listStatus, page, retryDetail: () => setDetailReload((value) => value + 1),
    retryList: () => setListReload((value) => value + 1), runTransition,
    select: (id: string) => select(id), selectedId, transitionError, transitioningId,
  };
}
