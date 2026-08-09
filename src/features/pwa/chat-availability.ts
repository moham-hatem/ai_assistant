import type { PwaCopy } from './copy/types.ts';
import type { PwaStatusState } from './model.ts';

export function getPwaChatBlockReason(
  status: Pick<PwaStatusState, 'apiCompatibility' | 'isOnline'>,
  copy: PwaCopy,
): string | null {
  if (!status.isOnline) return copy.composerOffline;
  if (status.apiCompatibility === 'incompatible') return copy.incompatibleBody;
  if (['checking', 'unknown'].includes(status.apiCompatibility)) return copy.compatibilityChecking;
  return null;
}
