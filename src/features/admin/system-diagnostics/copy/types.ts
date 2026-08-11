import type {
  SafeDiagnosticLocation,
  SystemDiagnosticCheckId,
  SystemDiagnosticCode,
  SystemDiagnosticStatus,
} from '../types';

export interface SystemDiagnosticsCopy {
  availableSpace: string;
  botConfigured: string;
  botRunning: string;
  checkedAt: string;
  checks: Record<SystemDiagnosticCheckId, string>;
  codes: Record<SystemDiagnosticCode, string>;
  errorBody: string;
  errorTitle: string;
  intro: string;
  loading: string;
  location: string;
  lastHandledUpdate: string;
  lastSuccessfulPoll: string;
  modes: Record<'local_only' | 'remote_with_local_fallback' | 'unconfigured', string>;
  noDetails: string;
  privacy: string;
  publicLink: string;
  publicUsername: string;
  readable: string;
  refresh: string;
  refreshing: string;
  scopes: Record<SafeDiagnosticLocation['scope'], string>;
  retryCount: string;
  runtimeStates: Record<'degraded' | 'running', string>;
  statuses: Record<SystemDiagnosticStatus, string>;
  summary: Record<SystemDiagnosticStatus, string>;
  title: string;
  telegramErrors: Record<
    'authentication_failed' | 'conflict' | 'network_unavailable' | 'not_configured'
    | 'rate_limited' | 'request_timeout' | 'service_unavailable' | 'unknown',
    string
  >;
  versionApi: string;
  versionApp: string;
  writable: string;
  yes: string;
  no: string;
}
