import { useEffect, useReducer } from 'react';
import { checkApiCompatibility } from '../../pwa/check-api-compatibility';
import { startApiCompatibilityCheck, type CompatibilityCheck } from './api-compatibility-monitor';
import { createPwaStatusState, pwaStatusReducer, subscribeToPwaStatus } from './model';

export function usePwaStatus(checkCompatibility: CompatibilityCheck = checkApiCompatibility) {
  const [state, dispatch] = useReducer(
    pwaStatusReducer,
    navigator.onLine,
    createPwaStatusState,
  );

  useEffect(() => subscribeToPwaStatus(
    { connection: navigator, events: window },
    dispatch,
  ), []);

  useEffect(() => {
    if (!state.isOnline) return undefined;
    return startApiCompatibilityCheck(checkCompatibility, dispatch);
  }, [checkCompatibility, state.isOnline]);

  return state;
}
