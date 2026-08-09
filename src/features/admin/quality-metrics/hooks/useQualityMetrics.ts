import { useEffect, useReducer } from 'react';
import { fetchQualityMetrics } from '../api/quality-metrics';
import {
  createQualityMetricsState,
  qualityMetricsReducer,
} from '../quality-metrics-state';

export function useQualityMetrics() {
  const [state, dispatch] = useReducer(
    qualityMetricsReducer,
    undefined,
    () => createQualityMetricsState(new Date()),
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchQualityMetrics(state.filters, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) dispatch({ response, type: 'loaded' });
      })
      .catch(() => {
        if (!controller.signal.aborted) dispatch({ type: 'failed' });
      });
    return () => controller.abort();
  }, [state.filters, state.reloadKey]);

  return { dispatch, state };
}
