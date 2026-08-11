import type {
  SystemDiagnosticCheckId,
  SystemDiagnosticCode,
  SystemDiagnosticDetails,
  SystemDiagnosticStatus,
} from '../../../../../shared/contracts/system-diagnostics';
import { invalid } from './parser-primitives';

export const systemDiagnosticCodes = [
  'access_denied', 'audit_configuration_invalid', 'configured', 'integrity_invalid',
  'integrity_probe_not_connected', 'integrity_probe_timeout', 'integrity_unavailable',
  'integrity_unverifiable', 'integrity_valid', 'invalid_database_file', 'local_only',
  'not_initialized', 'path_probe_timeout', 'path_unavailable', 'ready',
  'tool_available', 'tool_timeout', 'tool_unavailable',
  'telegram_degraded', 'telegram_not_configured', 'telegram_running',
  'telegram_status_invalid', 'telegram_status_missing', 'telegram_status_stale',
] as const satisfies readonly SystemDiagnosticCode[];

const optionalChecks = new Set<SystemDiagnosticCheckId>(['ocr.pdftoppm', 'ocr.tesseract', 'telegram.bot']);
const pathCodes = new Set<SystemDiagnosticCode>([
  'access_denied', 'not_initialized', 'path_probe_timeout', 'path_unavailable', 'ready',
]);
const databaseCodes = new Set<SystemDiagnosticCode>([...pathCodes, 'invalid_database_file']);
const auditCodes = new Set<SystemDiagnosticCode>([
  'audit_configuration_invalid', 'integrity_invalid', 'integrity_probe_not_connected',
  'integrity_probe_timeout', 'integrity_unavailable', 'integrity_unverifiable', 'integrity_valid',
]);
const modelCodes = new Set<SystemDiagnosticCode>(['configured', 'local_only', 'path_unavailable']);
const toolCodes = new Set<SystemDiagnosticCode>(['tool_available', 'tool_timeout', 'tool_unavailable']);
const telegramCodes = new Set<SystemDiagnosticCode>([
  'telegram_degraded', 'telegram_not_configured', 'telegram_running',
  'telegram_status_invalid', 'telegram_status_missing', 'telegram_status_stale',
]);

export function validateRequiredFlag(id: SystemDiagnosticCheckId, required: boolean): void {
  if (required === optionalChecks.has(id)) invalid('required flag');
}

export function validateCheckStatus(code: SystemDiagnosticCode, status: SystemDiagnosticStatus): void {
  const healthy = new Set<SystemDiagnosticCode>(['configured', 'integrity_valid', 'local_only', 'ready', 'telegram_running', 'tool_available']);
  const variable = new Set<SystemDiagnosticCode>(['not_initialized']);
  const degraded = new Set<SystemDiagnosticCode>([
    'integrity_probe_not_connected', 'integrity_unverifiable', 'telegram_degraded',
    'telegram_not_configured', 'telegram_status_missing', 'telegram_status_stale',
  ]);
  if (healthy.has(code) && status !== 'healthy') invalid('healthy check status');
  if (degraded.has(code) && status !== 'degraded') invalid('degraded check status');
  if (!healthy.has(code) && !variable.has(code) && !degraded.has(code) && status !== 'unavailable') invalid('unavailable check status');
  if (variable.has(code) && !['degraded', 'unavailable'].includes(status)) invalid('initialization status');
}

export function validateCheckShape(
  id: SystemDiagnosticCheckId,
  code: SystemDiagnosticCode,
  details: SystemDiagnosticDetails | undefined,
): void {
  const allowed = id.startsWith('storage.') ? pathCodes
    : id.startsWith('database.') ? databaseCodes
      : id === 'audit.integrity' ? auditCodes
        : id === 'model.configuration' ? modelCodes
          : id === 'telegram.bot' ? telegramCodes : toolCodes;
  if (!allowed.has(code)) invalid('check code placement');
  if ((id.startsWith('storage.') || id.startsWith('database.')) && !details?.location) invalid('path details');
  if (id.startsWith('ocr.') && details !== undefined) invalid('tool details');
  if (id === 'model.configuration') validateModelDetails(code, details);
  if (id === 'audit.integrity') validateIntegrityDetails(code, details);
  if (id === 'telegram.bot') validateTelegramDetails(code, details);
}

function validateTelegramDetails(code: SystemDiagnosticCode, details: SystemDiagnosticDetails | undefined): void {
  if (code === 'telegram_status_invalid' || code === 'telegram_status_missing') {
    if (details !== undefined) invalid('Telegram empty details');
    return;
  }
  if (!details || details.running === undefined || details.configured === undefined
    || details.runtimeState === undefined || details.retryCount === undefined) {
    invalid('Telegram details');
  }
  if ((details.publicUsername === undefined) !== (details.publicLink === undefined)) {
    invalid('Telegram public identity');
  }
  if (details.publicUsername && details.publicLink !== `https://t.me/${details.publicUsername}`) {
    invalid('Telegram public link');
  }
  if (code === 'telegram_running' && (
    !details.configured || !details.running || details.runtimeState !== 'running'
    || details.telegramErrorCode !== undefined
  )) invalid('Telegram running details');
  if (code !== 'telegram_running' && (details.running || details.runtimeState !== 'degraded')) {
    invalid('Telegram degraded details');
  }
  if (code === 'telegram_not_configured' && details.configured) invalid('Telegram configuration details');
  if (code === 'telegram_degraded' && !details.telegramErrorCode) invalid('Telegram error details');
}

function validateModelDetails(code: SystemDiagnosticCode, details: SystemDiagnosticDetails | undefined): void {
  const expected = code === 'configured'
    ? { configured: true, mode: 'remote_with_local_fallback' }
    : code === 'local_only'
      ? { configured: true, mode: 'local_only' }
      : { configured: false, mode: 'unconfigured' };
  if (details?.configured !== expected.configured || details.mode !== expected.mode) invalid('model details');
}

function validateIntegrityDetails(code: SystemDiagnosticCode, details: SystemDiagnosticDetails | undefined): void {
  const expected = code === 'integrity_valid' ? 'valid'
    : code === 'integrity_invalid' ? 'invalid'
      : code === 'integrity_unverifiable' ? 'unverifiable' : undefined;
  if (details?.integrity !== expected) invalid('integrity details');
}
