import type {
  SafeDiagnosticLocation,
  SystemDiagnosticCheckId,
  SystemDiagnosticCode,
  SystemDiagnosticStatus,
} from '../types';

export interface SystemDiagnosticsCopy {
  availableSpace: string;
  checkedAt: string;
  checks: Record<SystemDiagnosticCheckId, string>;
  codes: Record<SystemDiagnosticCode, string>;
  errorBody: string;
  errorTitle: string;
  intro: string;
  loading: string;
  location: string;
  modes: Record<'local_only' | 'remote_with_local_fallback' | 'unconfigured', string>;
  noDetails: string;
  privacy: string;
  readable: string;
  refresh: string;
  refreshing: string;
  scopes: Record<SafeDiagnosticLocation['scope'], string>;
  statuses: Record<SystemDiagnosticStatus, string>;
  summary: Record<SystemDiagnosticStatus, string>;
  title: string;
  versionApi: string;
  versionApp: string;
  writable: string;
  yes: string;
  no: string;
}
