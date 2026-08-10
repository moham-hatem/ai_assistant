import {
  SYSTEM_DIAGNOSTIC_CHECK_IDS,
  SYSTEM_DIAGNOSTIC_STATUSES,
  type SafeDiagnosticLocation,
  type SystemDiagnosticCheck,
  type SystemDiagnosticCheckId,
  type SystemDiagnosticDetails,
} from '../../../../../shared/contracts/system-diagnostics';
import {
  boolean,
  boundedInteger,
  enumeration,
  exactKeys,
  invalid,
  object,
  optionalKeys,
  patternString,
} from './parser-primitives';
import {
  systemDiagnosticCodes,
  validateCheckShape,
  validateCheckStatus,
  validateRequiredFlag,
} from './system-diagnostic-check-rules';

const dataPathPattern = /^data(?:\/[A-Za-z0-9._-]+)*$/u;

export function parseSystemDiagnosticCheck(value: unknown): SystemDiagnosticCheck {
  const payload = object(value, 'check');
  const hasDetails = Object.hasOwn(payload, 'details');
  exactKeys(payload, hasDetails
    ? ['code', 'details', 'id', 'required', 'status']
    : ['code', 'id', 'required', 'status'], 'check');
  const id = enumeration(payload.id, SYSTEM_DIAGNOSTIC_CHECK_IDS, 'check id');
  const required = boolean(payload.required, 'required');
  validateRequiredFlag(id, required);
  const code = enumeration(payload.code, systemDiagnosticCodes, 'check code');
  const status = enumeration(payload.status, SYSTEM_DIAGNOSTIC_STATUSES, 'check status');
  validateCheckStatus(code, status);
  const details = hasDetails ? parseDetails(payload.details, id) : undefined;
  validateCheckShape(id, code, details);
  return { code, ...(details ? { details } : {}), id, required, status };
}

function parseDetails(value: unknown, id: SystemDiagnosticCheckId): SystemDiagnosticDetails {
  const payload = object(value, 'check details');
  optionalKeys(payload, [
    'availableSpaceMiB', 'configured', 'integrity', 'location', 'mode', 'readable', 'writable',
  ], 'check details');
  if (Object.keys(payload).length === 0) invalid('check details');
  const details: SystemDiagnosticDetails = {};
  if (Object.hasOwn(payload, 'availableSpaceMiB')) details.availableSpaceMiB = boundedInteger(payload.availableSpaceMiB, 'availableSpaceMiB');
  if (Object.hasOwn(payload, 'configured')) details.configured = boolean(payload.configured, 'configured');
  if (Object.hasOwn(payload, 'integrity')) details.integrity = enumeration(payload.integrity, ['invalid', 'unverifiable', 'valid'] as const, 'integrity');
  if (Object.hasOwn(payload, 'location')) details.location = parseLocation(payload.location);
  if (Object.hasOwn(payload, 'mode')) details.mode = enumeration(payload.mode, ['local_only', 'remote_with_local_fallback', 'unconfigured'] as const, 'mode');
  if (Object.hasOwn(payload, 'readable')) details.readable = boolean(payload.readable, 'readable');
  if (Object.hasOwn(payload, 'writable')) details.writable = boolean(payload.writable, 'writable');
  validateDetailPlacement(id, details);
  return details;
}

function parseLocation(value: unknown): SafeDiagnosticLocation {
  const payload = object(value, 'location');
  const hasRelativePath = Object.hasOwn(payload, 'relativePath');
  exactKeys(payload, hasRelativePath ? ['relativePath', 'scope'] : ['scope'], 'location');
  const scope = enumeration(payload.scope, ['external', 'memory', 'workspace'] as const, 'location scope');
  if (!hasRelativePath) return { scope };
  if (scope !== 'workspace') invalid('relative path scope');
  return { relativePath: patternString(payload.relativePath, dataPathPattern, 'relative data path'), scope };
}

function validateDetailPlacement(id: SystemDiagnosticCheckId, details: SystemDiagnosticDetails): void {
  const pathCheck = id.startsWith('storage.') || id.startsWith('database.');
  if (details.location && !pathCheck) invalid('location placement');
  if ((details.readable !== undefined || details.writable !== undefined || details.availableSpaceMiB !== undefined) && !pathCheck) invalid('path detail placement');
  if ((details.mode !== undefined || details.configured !== undefined) && id !== 'model.configuration') invalid('model detail placement');
  if (details.integrity !== undefined && id !== 'audit.integrity') invalid('integrity placement');
}
