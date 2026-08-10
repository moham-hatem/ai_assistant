import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SecurityAuditAction, SecurityAuditState } from '../security-audit-state';
import { visibleAuditRange } from '../security-audit-state';
import type { SecurityAuditCopy } from '../copy';

export function SecurityAuditPagination({ copy, dispatch, state }: {
  copy: SecurityAuditCopy;
  dispatch: React.Dispatch<SecurityAuditAction>;
  state: SecurityAuditState;
}) {
  const range = visibleAuditRange(state);
  const page = state.snapshot?.page;
  return <nav className="security-audit-pagination" aria-label={copy.title}>
    <span>{copy.range(range.start, range.end, range.total)}</span>
    <div>
      <button disabled={state.offset === 0} type="button" onClick={() => dispatch({ type: 'previous' })}>
        <ChevronLeft aria-hidden="true" />{copy.previous}
      </button>
      <button disabled={!page || page.offset + page.items.length >= page.total} type="button" onClick={() => dispatch({ type: 'next' })}>
        {copy.next}<ChevronRight aria-hidden="true" />
      </button>
    </div>
  </nav>;
}
