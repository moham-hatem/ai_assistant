import { AppError } from '../../errors.ts';

export type MaintenanceCliInput = RestoreCliInput | RetentionCliInput;

export interface RestoreCliInput {
  apply: boolean;
  backupId: string;
  command: 'restore';
  confirmation?: string;
}

export interface RetentionCliInput {
  apply: boolean;
  command: 'retention';
  confirmation?: string;
  keepCount: number;
}

export function parseMaintenanceCliInput(args: readonly string[]): MaintenanceCliInput {
  const [command, ...options] = args;
  if (command !== 'restore' && command !== 'retention') throw invalid('Use restore or retention.');
  const values = parseOptions(options);
  const allowed = command === 'restore'
    ? new Set(['apply', 'backup', 'confirm'])
    : new Set(['apply', 'confirm', 'keep']);
  for (const key of values.keys()) if (!allowed.has(key)) throw invalid(`Unknown --${key} option.`);
  const apply = values.get('apply') === true;
  const confirmation = optionalText(values, 'confirm');
  if (command === 'restore') {
    const backup = requiredText(values, 'backup').replace(/\.ilabackup$/u, '');
    if (!uuid(backup)) throw invalid('--backup must be a local backup UUID or UUID.ilabackup filename.');
    return { apply, backupId: backup, command, confirmation };
  }
  const keep = requiredText(values, 'keep');
  if (!/^\d+$/u.test(keep)) throw invalid('--keep must be a positive integer.');
  const keepCount = Number(keep);
  if (!Number.isSafeInteger(keepCount) || keepCount < 1 || keepCount > 10_000) {
    throw invalid('--keep must be between 1 and 10000.');
  }
  return { apply, command, confirmation, keepCount };
}

export function restoreConfirmation(id: string, artifactSha256: string): string {
  if (!/^[0-9a-f]{64}$/u.test(artifactSha256)) throw invalid('Backup artifact checksum is invalid.');
  return `RESTORE-${id}-${artifactSha256.slice(0, 16).toUpperCase()}`;
}

function parseOptions(args: readonly string[]): Map<string, string | true> {
  const values = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const match = args[index]?.match(/^--([a-z-]+)$/u);
    if (!match || values.has(match[1])) throw invalid('Maintenance options must be unique --name values.');
    if (match[1] === 'apply') {
      values.set(match[1], true);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw invalid(`--${match[1]} requires a value.`);
    values.set(match[1], value);
    index += 1;
  }
  return values;
}

function requiredText(values: Map<string, string | true>, name: string): string {
  const value = values.get(name);
  if (typeof value !== 'string' || !value) throw invalid(`--${name} is required.`);
  return value;
}

function optionalText(values: Map<string, string | true>, name: string): string | undefined {
  const value = values.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value) throw invalid(`--${name} requires a value.`);
  return value;
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
}

function invalid(message: string): AppError {
  return new AppError('INVALID_REQUEST', message, 400);
}
