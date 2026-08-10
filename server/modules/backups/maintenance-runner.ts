import type { BackupRestoreResult } from '../../../shared/contracts/backups.ts';
import { AppError } from '../../errors.ts';
import { type BackupMaintenanceConfig } from './maintenance-config.ts';
import { restoreConfirmation, type MaintenanceCliInput } from './maintenance-cli-input.ts';
import { withMaintenanceLock } from './maintenance-lock.ts';
import { createRetentionPlan, applyRetentionPlan } from './retention.ts';
import { validateRestoredSnapshot, type RestoredValidationReport } from './restored-validation.ts';
import { RuntimeSafetyGuard } from './runtime-safety.ts';
import { LocalBackupService } from './service.ts';

export interface MaintenanceOutput {
  write(value: Record<string, unknown>): void;
}

export interface MaintenanceRunnerOptions {
  config: BackupMaintenanceConfig;
  output: MaintenanceOutput;
  safety: RuntimeSafetyGuard;
}

export async function runBackupMaintenance(
  input: MaintenanceCliInput,
  options: MaintenanceRunnerOptions,
): Promise<void> {
  if (input.command === 'retention') return runRetention(input, options);
  return runRestore(input, options);
}

async function runRestore(
  input: Extract<MaintenanceCliInput, { command: 'restore' }>,
  options: MaintenanceRunnerOptions,
): Promise<void> {
  let report: RestoredValidationReport | undefined;
  let checkedDomains: string[] = [];
  const service = new LocalBackupService({
    ...options.config.backup,
    restoreCoordinator: {
      afterRestore: () => undefined,
      beforeRestore: () => options.safety.assertStopped(),
      preflightIncoming: async (incomingRoot, backup) => {
        await validateRestoredSnapshot(incomingRoot, backup);
        checkedDomains = (
          await options.config.preflightRestoredDomains?.(incomingRoot)
        )?.checkedDomains ?? [];
        await validateRestoredSnapshot(incomingRoot, backup);
      },
      validateRestored: async (backup) => {
        report = await validateRestoredSnapshot(options.config.backup.dataDirectory, backup);
      },
    },
  });
  const validation = await service.validate(input.backupId);
  const selectedBackup = await service.download(input.backupId);
  const confirmation = restoreConfirmation(input.backupId, selectedBackup.summary.artifactSha256);
  if (!input.apply) {
    options.output.write({
      apply: false, backupId: input.backupId, confirmation,
      artifactSha256: selectedBackup.summary.artifactSha256,
      fileCount: validation.fileCount, operation: 'restore-preview', totalBytes: validation.totalBytes,
    });
    return;
  }
  if (input.confirmation !== confirmation) {
    throw invalid('Restore confirmation does not match the selected validated backup.');
  }
  await options.safety.assertStopped();
  const restored = await withMaintenanceLock(
    options.config.backup.backupDirectory,
    'restore',
    async () => {
      await options.safety.assertStopped();
      const result = await service.restore(
        input.backupId,
        new Date(),
        selectedBackup.summary.artifactSha256,
      );
      await options.safety.assertStopped();
      return result;
    },
  );
  options.output.write(restoreOutput(restored, report, checkedDomains));
}

async function runRetention(
  input: Extract<MaintenanceCliInput, { command: 'retention' }>,
  options: MaintenanceRunnerOptions,
): Promise<void> {
  const service = new LocalBackupService(options.config.backup);
  const plan = createRetentionPlan(await service.list(), input.keepCount);
  options.output.write({
    apply: input.apply,
    confirmation: plan.confirmation,
    deleteIds: plan.delete.map((backup) => backup.id),
    keepIds: plan.keep.map((backup) => backup.id),
    operation: 'retention-preview',
  });
  if (!input.apply) return;
  await options.safety.assertStopped();
  const deleted = await withMaintenanceLock(
    options.config.backup.backupDirectory,
    'retention',
    async () => {
      await options.safety.assertStopped();
      return applyRetentionPlan(
        service,
        options.config.backup.backupDirectory,
        plan,
        input.confirmation,
      );
    },
  );
  options.output.write({ deletedIds: deleted, operation: 'retention-applied' });
}

function restoreOutput(
  restored: BackupRestoreResult,
  report: RestoredValidationReport | undefined,
  checkedDomains: string[],
): Record<string, unknown> {
  if (!report) throw invalid('Post-restore validation did not complete.');
  return {
    backupId: restored.backupId,
    checkedDatabases: report.checkedDatabases,
    checkedDomains,
    checkedFiles: report.checkedFiles,
    completedAt: restored.completedAt,
    operation: 'restore-complete',
    restoredFiles: restored.restoredFiles,
  };
}

function invalid(message: string): AppError {
  return new AppError('INVALID_REQUEST', message, 400);
}
