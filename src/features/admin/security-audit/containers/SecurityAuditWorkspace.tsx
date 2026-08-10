import type { AppLanguage } from '../../../../i18n/language';
import { securityAuditCopies } from '../copy';
import { useSecurityAudit } from '../hooks/useSecurityAudit';
import { SecurityAuditEventList } from '../components/SecurityAuditEventList';
import { SecurityAuditFilters } from '../components/SecurityAuditFilters';
import { SecurityAuditIntegrityCard } from '../components/SecurityAuditIntegrityCard';
import { SecurityAuditPagination } from '../components/SecurityAuditPagination';
import { SecurityAuditPanelState } from '../components/SecurityAuditPanelState';

export function SecurityAuditWorkspace({ language }: { language: AppLanguage }) {
  const copy = securityAuditCopies[language];
  const { dispatch, state } = useSecurityAudit();
  const snapshot = state.snapshot;
  return <div className="security-audit-workspace">
    <SecurityAuditFilters copy={copy} dispatch={dispatch} state={state} />
    {state.status === 'loading' && <SecurityAuditPanelState copy={copy} kind="loading" />}
    {state.status === 'error' && <SecurityAuditPanelState copy={copy} kind="error" onRetry={() => dispatch({ type: 'retry' })} />}
    {state.status === 'ready' && snapshot && <>
      <SecurityAuditIntegrityCard copy={copy} integrity={snapshot.integrity} language={language} />
      {snapshot.page.items.length === 0
        ? <SecurityAuditPanelState copy={copy} kind="empty" />
        : <SecurityAuditEventList copy={copy} events={snapshot.page.items} language={language} />}
      <SecurityAuditPagination copy={copy} dispatch={dispatch} state={state} />
    </>}
  </div>;
}
