import { acquireMaintenanceAdmission } from './runtime-admission.ts';
import { recoveryRequired } from './recovery-required.ts';

export async function withMaintenanceLock<T>(
  backupDirectory: string,
  _operation: 'restore' | 'retention',
  run: () => Promise<T>,
): Promise<T> {
  const admission = await acquireMaintenanceAdmission(backupDirectory);
  let preserveForRecovery = false;
  try { return await run(); }
  catch (error) {
    preserveForRecovery = recoveryRequired(error);
    throw error;
  } finally {
    if (!preserveForRecovery) await admission.release();
  }
}
