import {
  SYSTEM_DIAGNOSTIC_CHECK_IDS,
  SYSTEM_DIAGNOSTIC_STATUSES,
  type SystemDiagnosticCheck,
  type SystemDiagnosticStatus,
  type SystemDiagnosticsReport,
  type SystemDiagnosticsResponse,
} from '../../../../../shared/contracts/system-diagnostics';
import { exactKeys, invalid, object, patternString, timestamp } from './parser-primitives';
import { parseSystemDiagnosticCheck } from './system-diagnostic-check-parser';

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/u;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/u;

export { SystemDiagnosticsApiError } from './system-diagnostics-api-error';

export function parseSystemDiagnosticsResponse(value: unknown): SystemDiagnosticsResponse {
  const wrapper = object(value, 'response');
  exactKeys(wrapper, ['diagnostics', 'requestId'], 'response');
  return {
    diagnostics: parseReport(wrapper.diagnostics),
    requestId: patternString(wrapper.requestId, requestIdPattern, 'requestId'),
  };
}

function parseReport(value: unknown): SystemDiagnosticsReport {
  const payload = object(value, 'diagnostics');
  exactKeys(payload, ['checkedAt', 'checks', 'status', 'versions'], 'diagnostics');
  if (!Array.isArray(payload.checks)) invalid('checks');
  const checks = payload.checks.map(parseSystemDiagnosticCheck);
  requireCompleteChecks(checks);
  const status = parseStatus(payload.status);
  if (status !== aggregateStatus(checks)) invalid('aggregate status');
  const versions = object(payload.versions, 'versions');
  exactKeys(versions, ['api', 'app'], 'versions');
  return {
    checkedAt: timestamp(payload.checkedAt, 'checkedAt'),
    checks,
    status,
    versions: {
      api: patternString(versions.api, versionPattern, 'api version'),
      app: patternString(versions.app, versionPattern, 'app version'),
    },
  };
}

function parseStatus(value: unknown): SystemDiagnosticStatus {
  if (typeof value !== 'string' || !SYSTEM_DIAGNOSTIC_STATUSES.includes(value as SystemDiagnosticStatus)) {
    invalid('status');
  }
  return value as SystemDiagnosticStatus;
}

function requireCompleteChecks(checks: readonly SystemDiagnosticCheck[]): void {
  if (checks.length !== SYSTEM_DIAGNOSTIC_CHECK_IDS.length) invalid('check count');
  const ids = new Set(checks.map((check) => check.id));
  if (ids.size !== checks.length || SYSTEM_DIAGNOSTIC_CHECK_IDS.some((id) => !ids.has(id))) invalid('check set');
}

function aggregateStatus(checks: readonly SystemDiagnosticCheck[]): SystemDiagnosticStatus {
  if (checks.some((check) => check.required && check.status === 'unavailable')) return 'unavailable';
  if (checks.some((check) => check.status !== 'healthy')) return 'degraded';
  return 'healthy';
}
