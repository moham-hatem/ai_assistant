import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBookDetailPage } from '../api/book-detail';
import { fetchBooks, transitionEdition } from '../api/books';
import {
  isCurrentBookRequest,
  nextOffset,
  previousOffset,
  replaceBook,
  replaceEdition,
  transitionFailureState,
  type TransitionFailure,
} from '../books-state';
import type {
  Book,
  BookEdition,
  BookEditionUploadResult,
  BookPage,
  EditionPage,
  EditionStatus,
  LoadStatus,
} from '../types';

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
  const [transitionError, setTransitionError] = useState<TransitionFailure | null>(null);
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
    setTransitionError(null);
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
    setTransitionError(null);
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

  function applyTransitionFailure(
    failure: TransitionFailure,
    bookId: string,
    requestedOffset: number,
  ) {
    const state = transitionFailureState(failure, isCurrentRequest(bookId, requestedOffset));
    if (!state) return;
    setTransitionError(state.transitionError);
    if (state.detailStatus) setDetailStatus(state.detailStatus);
  }

  const runTransition = useCallback(async (editionId: string, target: EditionStatus) => {
    const bookId = selectedIdRef.current;
    const requestedOffset = editionOffsetRef.current;
    if (!bookId || transitioningIdRef.current) return null;
    transitioningIdRef.current = editionId;
    setTransitionError(null);
    setTransitioningId(editionId);
    let stage: TransitionFailure = 'transition';
    try {
      const updated = await transitionEdition(bookId, editionId, target);
      if (!isCurrentRequest(bookId, requestedOffset)) return null;
      setBook(null);
      setEditions(null);
      setDetailStatus('loading');
      stage = 'refresh';
      const detail = await fetchBookDetailPage(bookId, editionPageSize, requestedOffset);
      if (!isCurrentRequest(bookId, requestedOffset)) return null;
      applyDetail(detail.book, detail.editions);
      return updated;
    } catch {
      applyTransitionFailure(stage, bookId, requestedOffset);
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

  const synchronizeUpload = useCallback((result: BookEditionUploadResult) => {
    if (selectedIdRef.current !== result.book.id) return;
    editionOffsetRef.current = 0;
    setEditionOffset(0);
    setBook(null);
    setEditions(null);
    setDetailStatus('loading');
    setDetailReload((value) => value + 1);
  }, []);

  const synchronizeProcessingApproval = useCallback((updated: BookEdition) => {
    if (selectedIdRef.current !== updated.bookId) return;
    setEditions((current) => current
      ? { ...current, items: replaceEdition(current.items, updated) }
      : current);
  }, []);

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
    retryList: () => setListReload((value) => value + 1), runTransition, synchronizeUpload,
    select: (id: string) => select(id), selectedId, synchronizeProcessingApproval,
    transitionError, transitioningId,
  };
}
