import { useEffect, useReducer } from 'react';
import { fetchSystemDiagnostics } from '../api/system-diagnostics';
import {
  createSystemDiagnosticsState,
  systemDiagnosticsReducer,
} from '../system-diagnostics-state';

export function useSystemDiagnostics() {
  const [state, dispatch] = useReducer(
    systemDiagnosticsReducer,
    undefined,
    createSystemDiagnosticsState,
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchSystemDiagnostics(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) dispatch({ response, type: 'loaded' });
      })
      .catch(() => {
        if (!controller.signal.aborted) dispatch({ type: 'failed' });
      });
    return () => controller.abort();
  }, [state.reloadKey]);

  return { dispatch, state };
}
