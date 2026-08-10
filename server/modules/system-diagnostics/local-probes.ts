import { constants } from 'node:fs';
import { access, open, stat, statfs } from 'node:fs/promises';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';

export interface PathInspection {
  availableSpaceMiB?: number;
  exists: boolean;
  kind: 'directory' | 'file' | 'memory' | 'other';
  readable: boolean;
  sqliteHeader?: boolean;
  writable: boolean;
}

export type ToolInspection = 'available' | 'timeout' | 'unavailable';

export interface LocalDiagnosticProbePorts {
  inspectPath(path: string, expected: 'database' | 'directory'): Promise<PathInspection>;
  inspectTool(executable: string, args: readonly string[], timeoutMs: number): Promise<ToolInspection>;
}

export const localDiagnosticProbePorts: LocalDiagnosticProbePorts = {
  inspectPath,
  inspectTool,
};

async function inspectPath(path: string, expected: 'database' | 'directory'): Promise<PathInspection> {
  if (path === ':memory:') {
    return { exists: true, kind: 'memory', readable: true, sqliteHeader: true, writable: true };
  }
  try {
    const metadata = await stat(path);
    const kind = metadata.isDirectory() ? 'directory' : metadata.isFile() ? 'file' : 'other';
    const [readable, writable, availableSpaceMiB] = await Promise.all([
      canAccess(path, constants.R_OK),
      canAccess(path, constants.W_OK),
      availableSpace(path),
    ]);
    const sqliteHeader = expected === 'database' && kind === 'file'
      ? await hasSqliteHeader(path)
      : undefined;
    return { availableSpaceMiB, exists: true, kind, readable, sqliteHeader, writable };
  } catch (error) {
    if (!isMissing(error)) throw error;
    const parent = await nearestExistingParent(dirname(path));
    return {
      availableSpaceMiB: await availableSpace(parent),
      exists: false,
      kind: expected === 'database' ? 'file' : 'directory',
      readable: false,
      writable: await canAccess(parent, constants.W_OK),
    };
  }
}

async function hasSqliteHeader(path: string): Promise<boolean> {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === header.length && header.toString('utf8') === 'SQLite format 3\0';
  } finally {
    await handle.close();
  }
}

async function nearestExistingParent(start: string): Promise<string> {
  let current = start;
  for (let depth = 0; depth < 32; depth += 1) {
    try {
      await stat(current);
      return current;
    } catch (error) {
      if (!isMissing(error)) throw error;
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
  return current;
}

async function canAccess(path: string, mode: number): Promise<boolean> {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

async function availableSpace(path: string): Promise<number | undefined> {
  try {
    const value = await statfs(path);
    return Math.floor(Number(value.bavail * value.bsize) / 1024 / 1024);
  } catch {
    return undefined;
  }
}

function inspectTool(
  executable: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<ToolInspection> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(executable, [...args], { shell: false, stdio: 'ignore', windowsHide: true });
    const finish = (result: ToolInspection) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish('timeout');
    }, timeoutMs);
    child.once('error', () => finish('unavailable'));
    child.once('exit', (code) => finish(code === 0 ? 'available' : 'unavailable'));
  });
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
