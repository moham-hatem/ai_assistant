import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { AppError } from '../../errors.ts';

const forbiddenNames = /^(?:\.env(?:\..*)?|.*(?:secret|credential).*|.*\.(?:key|pem|p12|pfx))$/iu;

export function assertInsideData(dataDirectory: string, candidate: string): string {
  const data = canonicalPath(dataDirectory);
  const target = canonicalPath(candidate);
  const difference = relative(comparisonPath(data), comparisonPath(target));
  if (difference === '' || (!difference.startsWith(`..${sep}`) && difference !== '..' && !isAbsolute(difference))) {
    return target;
  }
  throw invalid('Backup paths must stay inside the configured data directory.');
}

export function toArchivePath(dataDirectory: string, candidate: string): string {
  const target = assertInsideData(dataDirectory, candidate);
  const archivePath = relative(canonicalPath(dataDirectory), target).split(sep).join('/');
  return validateArchivePath(archivePath);
}

export function resolveArchivePath(dataDirectory: string, archivePath: string): string {
  const validated = validateArchivePath(archivePath);
  return assertInsideData(dataDirectory, resolve(dataDirectory, ...validated.split('/')));
}

export function validateArchivePath(value: string): string {
  if (!value || value.length > 1_024 || value.includes('\\') || value.includes('\0') || value.startsWith('/')) {
    throw invalid('Backup contains an unsafe path.');
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw invalid('Backup contains an unsafe path.');
  }
  if (parts[0]?.toLowerCase() === 'backups') {
    throw invalid('A backup cannot contain the backup storage directory.');
  }
  return parts.join('/');
}

export function isSensitivePath(archivePath: string): boolean {
  return archivePath.split('/').some((part) => forbiddenNames.test(part));
}

export function assertNonOverlappingScopes(scopes: readonly string[]): void {
  const validated = scopes.map(validateArchivePath);
  const keys = validated.map(archivePathComparisonKey);
  const sorted = [...new Set(keys)].sort();
  if (sorted.length !== scopes.length) throw invalid('Backup scopes must be unique.');
  for (let index = 0; index < sorted.length; index += 1) {
    for (let nested = index + 1; nested < sorted.length; nested += 1) {
      if (sorted[nested]?.startsWith(`${sorted[index]}/`)) {
        throw invalid('Backup scopes must not overlap.');
      }
    }
  }
}

export function pathsOverlap(left: string, right: string): boolean {
  const first = comparisonPath(canonicalPath(left));
  const second = comparisonPath(canonicalPath(right));
  return first === second || first.startsWith(`${second}${sep}`) || second.startsWith(`${first}${sep}`);
}

export function canonicalPath(value: string): string {
  const pending: string[] = [];
  let cursor = resolve(value);
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    pending.unshift(basename(cursor));
    cursor = parent;
  }
  const existing = existsSync(cursor) ? realpathSync.native(cursor) : cursor;
  return resolve(existing, ...pending);
}

function comparisonPath(value: string): string {
  return process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value;
}

export function archivePathComparisonKey(value: string): string {
  return process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value;
}

function invalid(message: string): AppError {
  return new AppError('INVALID_REQUEST', message, 400);
}
