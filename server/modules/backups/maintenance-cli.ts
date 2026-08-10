import { pathToFileURL } from 'node:url';
import { createBackupMaintenanceConfig } from './maintenance-config.ts';
import { parseMaintenanceCliInput } from './maintenance-cli-input.ts';
import { runBackupMaintenance } from './maintenance-runner.ts';
import { maintenancePorts, RuntimeSafetyGuard } from './runtime-safety.ts';

export async function runMaintenanceCli(
  args: readonly string[],
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): Promise<void> {
  const input = parseMaintenanceCliInput(args);
  const config = createBackupMaintenanceConfig(env, cwd);
  await runBackupMaintenance(input, {
    config,
    output: { write: (value) => process.stdout.write(`${JSON.stringify(value)}\n`) },
    safety: new RuntimeSafetyGuard(config.databasePaths, maintenancePorts(env)),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMaintenanceCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown maintenance failure.';
    process.stderr.write(`Backup maintenance blocked: ${message}\n`);
    process.exitCode = 1;
  });
}
