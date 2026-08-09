import { useEffect, useReducer } from 'react';
import { createPwaStatusState, pwaStatusReducer, subscribeToPwaStatus } from './model';

export function usePwaStatus() {
  const [state, dispatch] = useReducer(
    pwaStatusReducer,
    navigator.onLine,
    createPwaStatusState,
  );

  useEffect(() => subscribeToPwaStatus(
    { connection: navigator, events: window },
    dispatch,
  ), []);

  return state;
}
