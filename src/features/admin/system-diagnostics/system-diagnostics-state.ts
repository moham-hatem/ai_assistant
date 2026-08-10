import type { SystemDiagnosticsLoadStatus, SystemDiagnosticsResponse } from './types';

export interface SystemDiagnosticsState {
  reloadKey: number;
  response: SystemDiagnosticsResponse | null;
  status: SystemDiagnosticsLoadStatus;
}

export type SystemDiagnosticsAction =
  | { response: SystemDiagnosticsResponse; type: 'loaded' }
  | { type: 'failed' | 'refresh' };

export function createSystemDiagnosticsState(): SystemDiagnosticsState {
  return { reloadKey: 0, response: null, status: 'loading' };
}

export function systemDiagnosticsReducer(
  state: SystemDiagnosticsState,
  action: SystemDiagnosticsAction,
): SystemDiagnosticsState {
  switch (action.type) {
    case 'loaded': return { ...state, response: action.response, status: 'ready' };
    case 'failed': return { ...state, status: 'error' };
    case 'refresh':
      if (state.status === 'loading' || state.status === 'refreshing') return state;
      return {
        ...state,
        reloadKey: state.reloadKey + 1,
        status: state.response ? 'refreshing' : 'loading',
      };
  }
}
