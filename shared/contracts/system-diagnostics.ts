export const SYSTEM_DIAGNOSTIC_STATUSES = [
  'healthy',
  'degraded',
  'unavailable',
] as const;

export type SystemDiagnosticStatus = (typeof SYSTEM_DIAGNOSTIC_STATUSES)[number];

export const SYSTEM_DIAGNOSTIC_CHECK_IDS = [
  'storage.data',
  'storage.documents',
  'storage.knowledge',
  'database.books',
  'database.questions',
  'database.auth',
  'audit.integrity',
  'model.configuration',
  'ocr.tesseract',
  'ocr.pdftoppm',
] as const;

export type SystemDiagnosticCheckId = (typeof SYSTEM_DIAGNOSTIC_CHECK_IDS)[number];

export type SystemDiagnosticCode =
  | 'access_denied'
  | 'audit_configuration_invalid'
  | 'configured'
  | 'integrity_invalid'
  | 'integrity_probe_not_connected'
  | 'integrity_probe_timeout'
  | 'integrity_unavailable'
  | 'integrity_unverifiable'
  | 'integrity_valid'
  | 'invalid_database_file'
  | 'local_only'
  | 'not_initialized'
  | 'path_probe_timeout'
  | 'path_unavailable'
  | 'ready'
  | 'tool_available'
  | 'tool_timeout'
  | 'tool_unavailable';

export interface SafeDiagnosticLocation {
  /** `relativePath` is present only when the target is inside the application workspace. */
  relativePath?: string;
  scope: 'external' | 'memory' | 'workspace';
}

export interface SystemDiagnosticDetails {
  availableSpaceMiB?: number;
  configured?: boolean;
  integrity?: 'invalid' | 'unverifiable' | 'valid';
  location?: SafeDiagnosticLocation;
  mode?: 'local_only' | 'remote_with_local_fallback' | 'unconfigured';
  readable?: boolean;
  writable?: boolean;
}

export interface SystemDiagnosticCheck {
  code: SystemDiagnosticCode;
  details?: SystemDiagnosticDetails;
  id: SystemDiagnosticCheckId;
  required: boolean;
  status: SystemDiagnosticStatus;
}

export interface SystemDiagnosticsReport {
  checkedAt: string;
  checks: SystemDiagnosticCheck[];
  status: SystemDiagnosticStatus;
  versions: {
    api: string;
    app: string;
  };
}

export interface SystemDiagnosticsResponse {
  diagnostics: SystemDiagnosticsReport;
  requestId: string;
}
