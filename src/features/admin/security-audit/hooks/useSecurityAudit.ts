import { useEffect, useReducer } from 'react';
import { fetchSecurityAudit } from '../api/security-audit';
import {
  createSecurityAuditState,
  securityAuditPageSize,
  securityAuditReducer,
} from '../security-audit-state';

export function useSecurityAudit() {
  const [state, dispatch] = useReducer(securityAuditReducer, undefined, createSecurityAuditState);

  useEffect(() => {
    const controller = new AbortController();
    void fetchSecurityAudit(state.filters, securityAuditPageSize, state.offset, controller.signal)
      .then((snapshot) => {
        if (!controller.signal.aborted) dispatch({ snapshot, type: 'loaded' });
      })
      .catch(() => {
        if (!controller.signal.aborted) dispatch({ type: 'failed' });
      });
    return () => controller.abort();
  }, [state.filters, state.offset, state.reloadKey]);

  return { dispatch, state };
}
