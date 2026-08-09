import { PWA_UPDATE_READY_EVENT } from '../../pwa/update-contract.ts';
import type { ApiCompatibilityState } from '../../pwa/check-api-compatibility.ts';

export type ApiCompatibilityStatus = ApiCompatibilityState['status'] | 'checking' | 'unknown';

export interface PwaUpdateInfo {
  version: string | null;
}

export interface PwaStatusState {
  apiCompatibility: ApiCompatibilityStatus;
  isOnline: boolean;
  update: PwaUpdateInfo | null;
}

export type PwaStatusAction =
  | { type: 'compatibility_check_started' }
  | { status: ApiCompatibilityState['status']; type: 'compatibility_checked' }
  | { isOnline: boolean; type: 'connection_changed' }
  | { update: PwaUpdateInfo; type: 'update_ready' };

export interface PwaStatusRuntime {
  connection: { readonly onLine: boolean };
  events: {
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  };
}

const MAX_VERSION_LENGTH = 80;
const SAFE_VERSION = /^[a-zA-Z0-9._-]+$/u;

export function createPwaStatusState(isOnline: boolean): PwaStatusState {
  return {
    apiCompatibility: isOnline ? 'checking' : 'unknown',
    isOnline,
    update: null,
  };
}

export function pwaStatusReducer(state: PwaStatusState, action: PwaStatusAction): PwaStatusState {
  switch (action.type) {
    case 'compatibility_check_started':
      return state.apiCompatibility === 'checking'
        ? state
        : { ...state, apiCompatibility: 'checking' };
    case 'compatibility_checked':
      return { ...state, apiCompatibility: action.status };
    case 'connection_changed':
      if (state.isOnline === action.isOnline) return state;
      return {
        ...state,
        apiCompatibility: action.isOnline ? 'checking' : state.apiCompatibility,
        isOnline: action.isOnline,
      };
    case 'update_ready':
      return { ...state, update: action.update };
  }
}

export function parsePwaUpdateReadyEvent(event: Event): PwaUpdateInfo | null {
  if (event.type !== PWA_UPDATE_READY_EVENT) return null;

  const detail = (event as Event & { detail?: unknown }).detail;
  if (!isRecord(detail) || !Object.prototype.hasOwnProperty.call(detail, 'version')) return null;
  if (detail.version === null) return { version: null };
  if (typeof detail.version !== 'string') return null;

  const version = detail.version.trim();
  return version.length > 0 && version.length <= MAX_VERSION_LENGTH && SAFE_VERSION.test(version)
    ? { version }
    : null;
}

export function subscribeToPwaStatus(
  runtime: PwaStatusRuntime,
  dispatch: (action: PwaStatusAction) => void,
): () => void {
  const handleOnline = () => dispatch({ isOnline: true, type: 'connection_changed' });
  const handleOffline = () => dispatch({ isOnline: false, type: 'connection_changed' });
  const handleUpdate = (event: Event) => {
    const update = parsePwaUpdateReadyEvent(event);
    if (update) dispatch({ type: 'update_ready', update });
  };

  runtime.events.addEventListener('online', handleOnline);
  runtime.events.addEventListener('offline', handleOffline);
  runtime.events.addEventListener(PWA_UPDATE_READY_EVENT, handleUpdate);
  dispatch({ isOnline: runtime.connection.onLine, type: 'connection_changed' });

  return () => {
    runtime.events.removeEventListener('online', handleOnline);
    runtime.events.removeEventListener('offline', handleOffline);
    runtime.events.removeEventListener(PWA_UPDATE_READY_EVENT, handleUpdate);
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
