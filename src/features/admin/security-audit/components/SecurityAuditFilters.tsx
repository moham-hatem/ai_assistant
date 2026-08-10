import {
  SECURITY_AUDIT_ACTIONS,
  SECURITY_AUDIT_CATEGORIES,
  SECURITY_AUDIT_OUTCOMES,
  SECURITY_AUDIT_SUBJECT_TYPES,
} from '../../../../../shared/contracts/security-audit';
import type { SecurityAuditAction, SecurityAuditState } from '../security-audit-state';
import type { SecurityAuditCopy } from '../copy';

interface SecurityAuditFiltersProps {
  copy: SecurityAuditCopy;
  dispatch: React.Dispatch<SecurityAuditAction>;
  state: SecurityAuditState;
}

export function SecurityAuditFilters({ copy, dispatch, state }: SecurityAuditFiltersProps) {
  const change = (field: keyof SecurityAuditState['draft']) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => dispatch({ field, type: 'draft-changed', value: event.target.value });

  return <form className="security-audit-filters" onSubmit={(event) => {
    event.preventDefault();
    dispatch({ type: 'apply' });
  }}>
    <div className="security-audit-filter-heading">
      <strong>{copy.filters}</strong>
      <span>{copy.filterHint}</span>
    </div>
    <label>{copy.category}<select value={state.draft.category} onChange={change('category')}>
      <option value="">{copy.all}</option>
      {SECURITY_AUDIT_CATEGORIES.map((value) => <option key={value} value={value}>{copy.categories[value]}</option>)}
    </select></label>
    <label>{copy.action}<select value={state.draft.action} onChange={change('action')}>
      <option value="">{copy.all}</option>
      {SECURITY_AUDIT_ACTIONS.map((value) => <option key={value} value={value}>{copy.actions[value]}</option>)}
    </select></label>
    <label>{copy.outcome}<select value={state.draft.outcome} onChange={change('outcome')}>
      <option value="">{copy.all}</option>
      {SECURITY_AUDIT_OUTCOMES.map((value) => <option key={value} value={value}>{copy.outcomes[value]}</option>)}
    </select></label>
    <label>{copy.from}<input type="datetime-local" value={state.draft.from} onChange={change('from')} /></label>
    <label>{copy.to}<input type="datetime-local" value={state.draft.to} onChange={change('to')} /></label>
    <label>{copy.actor}<input dir="ltr" value={state.draft.actorUserId} onChange={change('actorUserId')} /></label>
    <label>{copy.subjectType}<select value={state.draft.subjectType} onChange={change('subjectType')}>
      <option value="">{copy.all}</option>
      {SECURITY_AUDIT_SUBJECT_TYPES.map((value) => <option key={value} value={value}>{copy.subjects[value]}</option>)}
    </select></label>
    <label>{copy.subjectId}<input dir="ltr" value={state.draft.subjectId} onChange={change('subjectId')} /></label>
    <label>{copy.requestId}<input dir="ltr" value={state.draft.requestId} onChange={change('requestId')} /></label>
    {state.validationError && <p className="security-audit-filter-error" role="alert">{copy.validation[state.validationError]}</p>}
    <button type="submit">{copy.apply}</button>
  </form>;
}
