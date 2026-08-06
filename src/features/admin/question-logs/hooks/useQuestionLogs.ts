import { useCallback, useEffect, useState } from 'react';
import { fetchQuestionLogPage, fetchQuestionLogRecord } from '../api/question-logs';
import { nextOffset, previousOffset } from '../pagination';
import type { LoadStatus, QuestionLogPage, QuestionLogRecord } from '../types';

const pageSize = 10;

export function useQuestionLogs() {
  const [detail, setDetail] = useState<QuestionLogRecord | null>(null);
  const [detailReload, setDetailReload] = useState(0);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>('idle');
  const [listReload, setListReload] = useState(0);
  const [listStatus, setListStatus] = useState<LoadStatus>('loading');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<QuestionLogPage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setListStatus('loading');
    void fetchQuestionLogPage(pageSize, offset, controller.signal)
      .then((nextPage) => {
        if (controller.signal.aborted) return;
        if (nextPage.items.length === 0 && offset > 0 && nextPage.total > 0) {
          setOffset(previousOffset(offset, pageSize));
          return;
        }
        setPage(nextPage);
        setListStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setListStatus('error');
      });
    return () => controller.abort();
  }, [listReload, offset]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailStatus('idle');
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    setDetailStatus('loading');
    void fetchQuestionLogRecord(selectedId, controller.signal)
      .then((record) => {
        if (controller.signal.aborted) return;
        setDetail(record);
        setDetailStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setDetailStatus('error');
      });
    return () => controller.abort();
  }, [detailReload, selectedId]);

  const clearSelection = useCallback(() => setSelectedId(null), []);
  const retryDetail = useCallback(() => setDetailReload((value) => value + 1), []);
  const retryList = useCallback(() => setListReload((value) => value + 1), []);
  const select = useCallback((id: string) => setSelectedId(id), []);

  const goToNextPage = useCallback(() => {
    if (!page) return;
    setSelectedId(null);
    setOffset((current) => nextOffset(current, page.limit, page.total));
  }, [page]);

  const goToPreviousPage = useCallback(() => {
    setSelectedId(null);
    setOffset((current) => previousOffset(current, page?.limit ?? pageSize));
  }, [page]);

  return {
    canGoNext: Boolean(page && page.offset + page.items.length < page.total),
    canGoPrevious: offset > 0,
    clearSelection,
    detail,
    detailStatus,
    goToNextPage,
    goToPreviousPage,
    listStatus,
    page,
    retryDetail,
    retryList,
    select,
    selectedId,
  };
}
