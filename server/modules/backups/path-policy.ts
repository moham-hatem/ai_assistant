import { isAbsolute, relative, resolve, sep } from 'node:path';
import { AppError } from '../../errors.ts';

const forbiddenNames = /^(?:\.env(?:\..*)?|.*(?:secret|credential).*|.*\.(?:key|pem|p12|pfx))$/iu;

export function assertInsideData(dataDirectory: string, candidate: string): string {
  const data = resolve(dataDirectory);
  const target = resolve(candidate);
  const difference = relative(data, target);
  if (difference === '' || (!difference.startsWith(`..${sep}`) && difference !== '..' && !isAbsolute(difference))) {
    return target;
  }
  throw invalid('Backup paths must stay inside the configured data directory.');
}

export function toArchivePath(dataDirectory: string, candidate: string): string {
  const target = assertInsideData(dataDirectory, candidate);
  const archivePath = relative(resolve(dataDirectory), target).split(sep).join('/');
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
  const sorted = [...new Set(scopes.map(validateArchivePath))].sort();
  if (sorted.length !== scopes.length) throw invalid('Backup scopes must be unique.');
  for (let index = 0; index < sorted.length; index += 1) {
    for (let nested = index + 1; nested < sorted.length; nested += 1) {
      if (sorted[nested]?.startsWith(`${sorted[index]}/`)) {
        throw invalid('Backup scopes must not overlap.');
      }
    }
  }
}

function invalid(message: string): AppError {
  return new AppError('INVALID_REQUEST', message, 400);
}
