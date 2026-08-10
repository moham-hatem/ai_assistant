import { lstat } from 'node:fs/promises';
import { connect } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { AppError } from '../../errors.ts';

export type PortProbe = (port: number) => Promise<boolean>;

export class RuntimeSafetyGuard {
  constructor(
    private readonly databasePaths: readonly string[],
    private readonly ports: readonly number[],
    private readonly probePort: PortProbe = localPortIsOpen,
  ) {}

  async assertStopped(): Promise<void> {
    let states: boolean[];
    try {
      states = await Promise.all(this.ports.map((port) => this.probePort(port)));
    } catch {
      throw unsafe('Runtime state could not be verified. Maintenance is blocked.');
    }
    if (states.some(Boolean)) throw unsafe('A local runtime port is active. Stop Vite and retry.');
    for (const path of this.databasePaths) await assertDatabaseIdle(path);
    const sidecars = await Promise.all(this.databasePaths.flatMap((path) => [
      exists(`${path}-wal`), exists(`${path}-shm`), exists(`${path}-journal`),
    ]));
    if (sidecars.some(Boolean)) {
      throw unsafe('SQLite writer sidecars remain present. Stop every writer cleanly before maintenance.');
    }
  }
}

export function maintenancePorts(env: Record<string, string | undefined>): number[] {
  const configured = env.BACKUP_RUNTIME_PORTS?.trim();
  const ports = configured
    ? configured.split(',').map((value) => parsePort(value.trim()))
    : Array.from({ length: 11 }, (_, index) => 5_173 + index);
  for (const value of [env.PORT, env.VITE_PORT]) if (value?.trim()) ports.push(parsePort(value.trim()));
  const originPort = originPortValue(env.AUTH_PUBLIC_ORIGIN);
  if (originPort) ports.push(originPort);
  return [...new Set(ports)];
}

async function assertDatabaseIdle(path: string): Promise<void> {
  if (!await exists(path)) return;
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(path);
    database.exec('PRAGMA busy_timeout = 0;');
    const quickCheck = database.prepare('PRAGMA quick_check').get() as { quick_check?: string };
    if (quickCheck.quick_check !== 'ok') throw unsafe('A SQLite database failed its pre-maintenance integrity check.');
    database.exec('BEGIN EXCLUSIVE; ROLLBACK;');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unsafe('A SQLite database is active or could not be locked exclusively.');
  } finally {
    database?.close();
  }
}

function localPortIsOpen(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(200);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('Local runtime port probe timed out.'));
    });
  });
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw unsafe('Runtime state could not be verified. Maintenance is blocked.');
  }
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw unsafe('BACKUP_RUNTIME_PORTS contains an invalid port.');
  }
  return port;
}

function originPortValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.port ? parsePort(url.port) : url.protocol === 'https:' ? 443 : 80;
  } catch {
    throw unsafe('AUTH_PUBLIC_ORIGIN is invalid; maintenance is blocked.');
  }
}

function unsafe(message: string): AppError {
  return new AppError('INVALID_REQUEST', message, 409);
}
