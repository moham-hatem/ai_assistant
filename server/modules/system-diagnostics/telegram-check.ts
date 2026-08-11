import type { SystemDiagnosticCheck } from '../../../shared/contracts/system-diagnostics.ts';
import type { TelegramRuntimeStatusRead } from '../../channels/telegram/runtime-status.ts';
import { withProbeTimeout } from './probe-timeout.ts';

export async function inspectTelegramStatus(
  readStatus: () => Promise<TelegramRuntimeStatusRead>,
  timeoutMs: number,
): Promise<SystemDiagnosticCheck> {
  let result: TelegramRuntimeStatusRead;
  try { result = await withProbeTimeout(readStatus(), timeoutMs); }
  catch { return telegramResult('telegram_status_invalid', 'unavailable'); }
  if (result.kind === 'missing') return telegramResult('telegram_status_missing', 'degraded');
  if (result.kind === 'invalid') return telegramResult('telegram_status_invalid', 'unavailable');
  const snapshot = result.snapshot;
  const details = {
    configured: snapshot.configured,
    ...(snapshot.errorCode === undefined ? {} : { telegramErrorCode: snapshot.errorCode }),
    ...(snapshot.lastHandledUpdateAt === undefined ? {} : { lastHandledUpdateAt: snapshot.lastHandledUpdateAt }),
    ...(snapshot.lastSuccessfulPoll === undefined ? {} : { lastSuccessfulPoll: snapshot.lastSuccessfulPoll }),
    ...(snapshot.publicLink === undefined ? {} : { publicLink: snapshot.publicLink }),
    ...(snapshot.publicUsername === undefined ? {} : { publicUsername: snapshot.publicUsername }),
    retryCount: snapshot.retryCount,
    running: result.kind === 'available' && snapshot.state === 'running',
    runtimeState: result.kind === 'stale' ? 'degraded' as const : snapshot.state,
  };
  if (result.kind === 'stale') return telegramResult('telegram_status_stale', 'degraded', details);
  if (!snapshot.configured) return telegramResult('telegram_not_configured', 'degraded', details);
  return snapshot.state === 'running'
    ? telegramResult('telegram_running', 'healthy', details)
    : telegramResult('telegram_degraded', 'degraded', details);
}

function telegramResult(
  code: Extract<SystemDiagnosticCheck['code'], `telegram_${string}`>,
  status: SystemDiagnosticCheck['status'],
  details?: SystemDiagnosticCheck['details'],
): SystemDiagnosticCheck {
  return { code, ...(details ? { details } : {}), id: 'telegram.bot', required: false, status };
}
