import type {
  QualityFilterDraft,
  QualityLoadStatus,
  QualityMetricsFilters,
  QualityMetricsResponse,
} from './types';

export interface QualityMetricsState {
  draft: QualityFilterDraft;
  filters: QualityMetricsFilters;
  reloadKey: number;
  response: QualityMetricsResponse | null;
  status: QualityLoadStatus;
  validationError: 'invalid-range' | 'invalid-time' | null;
}

export type QualityMetricsAction =
  | { field: keyof QualityFilterDraft; type: 'draft-changed'; value: string }
  | { response: QualityMetricsResponse; type: 'loaded' }
  | { type: 'apply' }
  | { type: 'failed' }
  | { type: 'retry' };

export function createQualityMetricsState(now: Date): QualityMetricsState {
  const to = new Date(now);
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const draft = { channel: '', from: inputDate(from), language: '', to: inputDate(to) };
  return {
    draft,
    filters: filtersFromDraft(draft) ?? { channel: null, from: null, language: null, to: null },
    reloadKey: 0,
    response: null,
    status: 'loading',
    validationError: null,
  };
}

export function qualityMetricsReducer(
  state: QualityMetricsState,
  action: QualityMetricsAction,
): QualityMetricsState {
  switch (action.type) {
    case 'draft-changed':
      return { ...state, draft: { ...state.draft, [action.field]: action.value }, validationError: null };
    case 'apply': {
      const filters = filtersFromDraft(state.draft);
      if (!filters) return { ...state, validationError: 'invalid-time' };
      if (filters.from && filters.to && filters.from >= filters.to) {
        return { ...state, validationError: 'invalid-range' };
      }
      return { ...state, filters, response: null, status: 'loading', validationError: null };
    }
    case 'loaded': return { ...state, response: action.response, status: 'ready' };
    case 'failed': return { ...state, response: null, status: 'error' };
    case 'retry': return { ...state, reloadKey: state.reloadKey + 1, status: 'loading' };
  }
}

export function isQualityMetricsEmpty(response: QualityMetricsResponse): boolean {
  const totals = response.metrics.totals;
  return totals.answerAttempts === 0
    && totals.feedbackCount === 0
    && totals.openReviewCount === 0
    && totals.medianReviewClosureMs === null;
}

function filtersFromDraft(draft: QualityFilterDraft): QualityMetricsFilters | null {
  const from = utcFromInput(draft.from);
  const to = utcFromInput(draft.to);
  if ((draft.from && !from) || (draft.to && !to)) return null;
  return {
    channel: draft.channel || null,
    from,
    language: draft.language || null,
    to,
  };
}

function utcFromInput(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}:00.000Z`);
  if (Number.isNaN(date.getTime()) || inputDate(date) !== value) return null;
  return date.toISOString();
}

function inputDate(value: Date): string {
  return value.toISOString().slice(0, 16);
}
