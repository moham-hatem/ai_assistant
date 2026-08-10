import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import {
  LOCAL_BACKUP_FORMAT,
  LOCAL_BACKUP_FORMAT_VERSION,
  type BackupManifest,
  type BackupManifestEntry,
} from '../../../shared/contracts/backups.ts';
import { AppError } from '../../errors.ts';
import {
  archivePathComparisonKey,
  assertNonOverlappingScopes,
  isSensitivePath,
  validateArchivePath,
} from './path-policy.ts';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const checksumPattern = /^[0-9a-f]{64}$/u;

interface BackupEnvelope {
  manifest: BackupManifest;
  payload: Record<string, string>;
}

export interface DecodedBackup {
  manifest: BackupManifest;
  payload: Map<string, Buffer>;
}

export async function writeBackupArtifact(
  destination: string,
  manifest: BackupManifest,
  files: ReadonlyMap<string, Buffer>,
): Promise<void> {
  const payload = Object.fromEntries([...files].map(([path, contents]) => [path, contents.toString('base64')]));
  const serialized = Buffer.from(JSON.stringify({ manifest, payload } satisfies BackupEnvelope));
  await writeFile(destination, await compress(serialized, { level: 9 }), { flag: 'wx', mode: 0o600 });
}

export async function readBackupArtifact(
  path: string,
  maximumBytes: number,
  maximumExpandedBytes: number,
): Promise<DecodedBackup> {
  const compressed = await readFile(path);
  if (compressed.length > maximumBytes) throw invalid('Backup artifact exceeds the configured size limit.');
  return decodeBackupArtifact(compressed, maximumExpandedBytes);
}

export async function decodeBackupArtifact(
  compressed: Buffer,
  maximumExpandedBytes: number,
): Promise<DecodedBackup> {
  let envelope: unknown;
  try {
    envelope = JSON.parse((await decompress(compressed, { maxOutputLength: maximumExpandedBytes })).toString('utf8')) as unknown;
  } catch (error) {
    throw invalid('Backup artifact is unreadable.', error);
  }
  return validateEnvelope(envelope);
}

export function createManifest(input: Omit<BackupManifest, 'manifestChecksum'>): BackupManifest {
  return { ...input, manifestChecksum: checksumManifest(input) };
}

export function checksumManifest(manifest: Omit<BackupManifest, 'manifestChecksum'>): string {
  return sha256(Buffer.from(JSON.stringify(manifest)));
}

export function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function validateEnvelope(value: unknown): DecodedBackup {
  if (!isObject(value) || !isObject(value.manifest) || !isObject(value.payload)) {
    throw invalid('Backup artifact has an invalid envelope.');
  }
  const manifest = parseManifest(value.manifest);
  const payload = new Map<string, Buffer>();
  const payloadKeys = Object.keys(value.payload).sort();
  const manifestKeys = manifest.files.map((entry) => entry.path).sort();
  if (JSON.stringify(payloadKeys) !== JSON.stringify(manifestKeys)) {
    throw invalid('Backup payload does not match its manifest.');
  }
  for (const entry of manifest.files) {
    const encoded = value.payload[entry.path];
    if (typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
      throw invalid('Backup payload contains invalid binary data.');
    }
    const contents = Buffer.from(encoded, 'base64');
    if (contents.length !== entry.size || sha256(contents) !== entry.sha256) {
      throw invalid('Backup file checksum validation failed.');
    }
    payload.set(entry.path, contents);
  }
  return { manifest, payload };
}

function parseManifest(value: Record<string, unknown>): BackupManifest {
  if (value.format !== LOCAL_BACKUP_FORMAT || value.formatVersion !== LOCAL_BACKUP_FORMAT_VERSION) {
    throw invalid('Backup format or version is not supported.');
  }
  const id = string(value.id, 'id');
  if (!/^[0-9a-f-]{36}$/iu.test(id)) throw invalid('Backup id is invalid.');
  const createdAt = string(value.createdAt, 'createdAt');
  if (!isCanonicalTimestamp(createdAt)) throw invalid('Backup timestamp is invalid.');
  const appVersion = string(value.appVersion, 'appVersion');
  const scopes = array(value.scopes, 'scopes').map((scope) => validateArchivePath(string(scope, 'scope')));
  assertNonOverlappingScopes(scopes);
  const files = array(value.files, 'files').map(parseEntry);
  const paths = new Set(files.map((entry) => archivePathComparisonKey(entry.path)));
  if (paths.size !== files.length) throw invalid('Backup manifest contains duplicate files.');
  if (files.some((entry) => !scopes.some((scope) => entry.path === scope || entry.path.startsWith(`${scope}/`)))) {
    throw invalid('Backup file is outside its declared restore scopes.');
  }
  const fileCount = integer(value.fileCount, 'fileCount');
  const totalBytes = integer(value.totalBytes, 'totalBytes');
  if (fileCount !== files.length || totalBytes !== files.reduce((total, entry) => total + entry.size, 0)) {
    throw invalid('Backup manifest totals are invalid.');
  }
  const manifestChecksum = string(value.manifestChecksum, 'manifestChecksum');
  if (!checksumPattern.test(manifestChecksum)) throw invalid('Backup manifest checksum is invalid.');
  const unsigned = {
    appVersion, createdAt, fileCount, files, format: LOCAL_BACKUP_FORMAT,
    formatVersion: LOCAL_BACKUP_FORMAT_VERSION, id, scopes, totalBytes,
  } satisfies Omit<BackupManifest, 'manifestChecksum'>;
  if (checksumManifest(unsigned) !== manifestChecksum) throw invalid('Backup manifest checksum validation failed.');
  return { ...unsigned, manifestChecksum };
}

function parseEntry(value: unknown): BackupManifestEntry {
  if (!isObject(value)) throw invalid('Backup manifest contains an invalid file entry.');
  const path = validateArchivePath(string(value.path, 'path'));
  if (isSensitivePath(path)) throw invalid('Backup contains a forbidden sensitive path.');
  const sha = string(value.sha256, 'sha256');
  if (!checksumPattern.test(sha)) throw invalid('Backup file checksum is invalid.');
  const kind = value.kind;
  if (kind !== 'file' && kind !== 'sqlite') throw invalid('Backup file kind is invalid.');
  return { kind, path, sha256: sha, size: integer(value.size, 'size') };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(`Backup ${field} is invalid.`);
  return value;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value || value.length > 4_096) throw invalid(`Backup ${field} is invalid.`);
  return value;
}

function integer(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid(`Backup ${field} is invalid.`);
  return value as number;
}

function isCanonicalTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function invalid(message: string, cause?: unknown): AppError {
  return new AppError('INVALID_REQUEST', message, 422, cause === undefined ? undefined : { cause });
}
