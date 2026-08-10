import type {
  SecurityAuditFilterDraft,
  SecurityAuditFilters,
  SecurityAuditLoadStatus,
  SecurityAuditSnapshot,
} from './types';

export type SecurityAuditValidationError = 'invalid-time' | 'invalid-range' | 'invalid-identifier' | null;

export interface SecurityAuditState {
  draft: SecurityAuditFilterDraft;
  filters: SecurityAuditFilters;
  offset: number;
  reloadKey: number;
  snapshot: SecurityAuditSnapshot | null;
  status: SecurityAuditLoadStatus;
  validationError: SecurityAuditValidationError;
}

export type SecurityAuditAction =
  | { field: keyof SecurityAuditFilterDraft; type: 'draft-changed'; value: string }
  | { snapshot: SecurityAuditSnapshot; type: 'loaded' }
  | { type: 'apply' | 'failed' | 'next' | 'previous' | 'retry' };

export const securityAuditPageSize = 25;

export function createSecurityAuditState(): SecurityAuditState {
  const draft: SecurityAuditFilterDraft = {
    action: '', actorUserId: '', category: '', from: '', outcome: '',
    requestId: '', subjectId: '', subjectType: '', to: '',
  };
  return {
    draft,
    filters: {},
    offset: 0,
    reloadKey: 0,
    snapshot: null,
    status: 'loading',
    validationError: null,
  };
}

export function securityAuditReducer(state: SecurityAuditState, action: SecurityAuditAction): SecurityAuditState {
  switch (action.type) {
    case 'draft-changed':
      return { ...state, draft: { ...state.draft, [action.field]: action.value }, validationError: null };
    case 'apply': {
      const parsed = filtersFromDraft(state.draft);
      if ('error' in parsed) return { ...state, validationError: parsed.error };
      return {
        ...state, filters: parsed.filters, offset: 0, snapshot: null,
        status: 'loading', validationError: null,
      };
    }
    case 'loaded': return { ...state, snapshot: action.snapshot, status: 'ready' };
    case 'failed': return { ...state, snapshot: null, status: 'error' };
    case 'retry': return { ...state, reloadKey: state.reloadKey + 1, snapshot: null, status: 'loading' };
    case 'next': {
      const page = state.snapshot?.page;
      if (!page || page.offset + page.items.length >= page.total) return state;
      return { ...state, offset: state.offset + page.limit, snapshot: null, status: 'loading' };
    }
    case 'previous':
      if (state.offset === 0) return state;
      return { ...state, offset: Math.max(0, state.offset - securityAuditPageSize), snapshot: null, status: 'loading' };
  }
}

export function visibleAuditRange(state: SecurityAuditState): { end: number; start: number; total: number } {
  const page = state.snapshot?.page;
  if (!page || page.items.length === 0) return { start: 0, end: 0, total: page?.total ?? 0 };
  return { start: page.offset + 1, end: page.offset + page.items.length, total: page.total };
}

function filtersFromDraft(
  draft: SecurityAuditFilterDraft,
): { filters: SecurityAuditFilters } | { error: Exclude<SecurityAuditValidationError, null> } {
  const from = utcFromInput(draft.from);
  const to = utcFromInput(draft.to);
  if ((draft.from && !from) || (draft.to && !to)) return { error: 'invalid-time' };
  if (from && to && from > to) return { error: 'invalid-range' };
  const identifier = /^[\p{L}\p{N}._:@/-]{1,128}$/u;
  const requestIdentifier = /^[A-Za-z0-9._:-]{1,128}$/u;
  if ([draft.actorUserId, draft.subjectId].some((value) => value && !identifier.test(value))
      || (draft.requestId && !requestIdentifier.test(draft.requestId))) {
    return { error: 'invalid-identifier' };
  }
  return {
    filters: Object.fromEntries(Object.entries({
      ...draft,
      from: from ?? '',
      to: to ?? '',
    }).filter(([, value]) => value !== '')) as SecurityAuditFilters,
  };
}

function utcFromInput(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return local === value ? date.toISOString() : null;
}
