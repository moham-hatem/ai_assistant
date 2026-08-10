export type {
  SafeDiagnosticLocation,
  SystemDiagnosticCheck,
  SystemDiagnosticCheckId,
  SystemDiagnosticCode,
  SystemDiagnosticDetails,
  SystemDiagnosticStatus,
  SystemDiagnosticsReport,
  SystemDiagnosticsResponse,
} from '../../../../shared/contracts/system-diagnostics';

export type SystemDiagnosticsLoadStatus = 'error' | 'loading' | 'ready' | 'refreshing';
