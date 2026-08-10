import type {
  SystemDiagnosticCheck,
  SystemDiagnosticCheckId,
  SystemDiagnosticStatus,
} from '../../../shared/contracts/system-diagnostics.ts';
import type { PathInspection } from './local-probes.ts';
import { ProbeTimeoutError } from './probe-timeout.ts';
import { safeDiagnosticLocation } from './safe-location.ts';

export function pathResult(
  id: SystemDiagnosticCheckId,
  path: string,
  required: boolean,
  result: PathInspection,
  workspaceRoot: string,
): SystemDiagnosticCheck {
  const details = pathDetails(path, result, workspaceRoot);
  if (!result.exists) return { code: 'not_initialized', details, id, required, status: result.writable ? 'degraded' : 'unavailable' };
  if (result.kind !== 'directory') return { code: 'path_unavailable', details, id, required, status: 'unavailable' };
  if (!result.readable || !result.writable) return { code: 'access_denied', details, id, required, status: 'unavailable' };
  return { code: 'ready', details, id, required, status: 'healthy' };
}

export function databaseResult(
  id: SystemDiagnosticCheckId,
  path: string,
  result: PathInspection,
  workspaceRoot: string,
): SystemDiagnosticCheck {
  const details = pathDetails(path, result, workspaceRoot);
  if (!result.exists) return { code: 'not_initialized', details, id, required: true, status: result.writable ? 'degraded' : 'unavailable' };
  if (result.kind !== 'file' && result.kind !== 'memory') return { code: 'path_unavailable', details, id, required: true, status: 'unavailable' };
  if (!result.readable || !result.writable) return { code: 'access_denied', details, id, required: true, status: 'unavailable' };
  if (result.sqliteHeader === false) return { code: 'invalid_database_file', details, id, required: true, status: 'unavailable' };
  return { code: 'ready', details, id, required: true, status: 'healthy' };
}

export function failedPath(
  id: SystemDiagnosticCheckId,
  path: string,
  required: boolean,
  workspaceRoot: string,
  error: unknown,
): SystemDiagnosticCheck {
  return {
    code: error instanceof ProbeTimeoutError ? 'path_probe_timeout' : 'path_unavailable',
    details: { location: safeDiagnosticLocation(workspaceRoot, path) },
    id,
    required,
    status: 'unavailable',
  };
}

export function aggregateStatus(checks: readonly SystemDiagnosticCheck[]): SystemDiagnosticStatus {
  if (checks.some((check) => check.required && check.status === 'unavailable')) return 'unavailable';
  if (checks.some((check) => check.status !== 'healthy')) return 'degraded';
  return 'healthy';
}

export function safeVersion(value: string): string {
  const trimmed = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/u.test(trimmed) ? trimmed : 'unknown';
}

function pathDetails(path: string, result: PathInspection, workspaceRoot: string) {
  return {
    ...(result.availableSpaceMiB === undefined ? {} : { availableSpaceMiB: result.availableSpaceMiB }),
    location: safeDiagnosticLocation(workspaceRoot, path),
    readable: result.readable,
    writable: result.writable,
  };
}
