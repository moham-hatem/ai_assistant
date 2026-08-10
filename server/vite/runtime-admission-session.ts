import type { FSWatcher } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import type { Http2SecureServer } from 'node:http2';
import { resolve } from 'node:path';
import { acquireRuntimeAdmission, type AdmissionLease } from '../modules/backups/runtime-admission.ts';

type Cleanup = () => Promise<void> | void;
type CloseEmitter = FSWatcher | HttpServer | Http2SecureServer;

export class RuntimeAdmissionSession {
  private cleanup: Cleanup | undefined;
  private closed = false;
  private operation: Promise<void> = Promise.resolve();

  constructor(
    readonly backupDirectory: string,
    private readonly admission: AdmissionLease,
  ) {}

  async reconfigure(setup: () => Promise<Cleanup>): Promise<void> {
    return this.serial(async () => {
      if (this.closed) throw new Error('Runtime admission session is already closed.');
      let cleanupError: unknown;
      try { await this.cleanup?.(); }
      catch (error) { cleanupError = error; }
      this.cleanup = undefined;
      if (cleanupError !== undefined) {
        this.closed = true;
        throw await releaseFailure(this.admission, 'Runtime reconfiguration cleanup failed.', cleanupError);
      }
      try { this.cleanup = await setup(); }
      catch (error) {
        this.closed = true;
        throw await releaseFailure(this.admission, 'Runtime configuration failed.', error);
      }
    });
  }

  async close(): Promise<void> {
    return this.serial(async () => {
      if (this.closed) return;
      this.closed = true;
      let cleanupError: unknown;
      try { await this.cleanup?.(); }
      catch (error) { cleanupError = error; }
      this.cleanup = undefined;
      if (cleanupError !== undefined) {
        throw await releaseFailure(this.admission, 'Runtime shutdown cleanup failed.', cleanupError);
      }
      await this.admission.release();
    });
  }

  private async serial(operation: () => Promise<void>): Promise<void> {
    const previous = this.operation;
    let complete!: () => void;
    this.operation = new Promise<void>((resolve) => { complete = resolve; });
    await previous;
    try { await operation(); }
    finally { complete(); }
  }
}

async function releaseFailure(
  admission: AdmissionLease,
  message: string,
  primaryError: unknown,
): Promise<AggregateError> {
  const errors = [primaryError];
  try { await admission.release(); }
  catch (error) { errors.push(error); }
  const detail = primaryError instanceof Error ? ` ${primaryError.message}` : '';
  return new AggregateError(errors, `${message}${detail}`, { cause: primaryError });
}

const sessionKey = Symbol.for('islamic-learning-assistant.vite-runtime-admission-session');
type SessionOwner = object & { [sessionKey]?: Promise<RuntimeAdmissionSession> };
const physicalRegistryKey = Symbol.for(
  'islamic-learning-assistant.vite-runtime-physical-admission-registry',
);

interface PhysicalAdmissionEntry {
  admission: AdmissionLease;
  references: number;
  releasing?: Promise<void>;
}

type PhysicalRegistry = Map<string, Promise<PhysicalAdmissionEntry>>;
type GlobalRegistryOwner = typeof globalThis & { [physicalRegistryKey]?: PhysicalRegistry };

export async function runtimeAdmissionSession(
  owner: object,
  closeEmitter: CloseEmitter,
  backupDirectory: string,
  onCloseError: (error: unknown) => void,
): Promise<RuntimeAdmissionSession> {
  const sessionOwner = owner as SessionOwner;
  const selectedDirectory = resolve(backupDirectory);
  const existing = sessionOwner[sessionKey];
  if (existing) {
    const session = await existing;
    if (session.backupDirectory !== selectedDirectory) {
      throw new Error('Vite runtime session cannot change its backup directory.');
    }
    return session;
  }
  const created = acquireSharedViteAdmission(selectedDirectory).then((admission) => {
    const session = new RuntimeAdmissionSession(selectedDirectory, admission);
    closeEmitter.once('close', () => { void session.close().catch(onCloseError); });
    return session;
  });
  sessionOwner[sessionKey] = created;
  void created.catch(() => {
    if (sessionOwner[sessionKey] === created) delete sessionOwner[sessionKey];
  });
  return created;
}

async function acquireSharedViteAdmission(backupDirectory: string): Promise<AdmissionLease> {
  const registryOwner = globalThis as GlobalRegistryOwner;
  const registry = registryOwner[physicalRegistryKey] ?? new Map();
  registryOwner[physicalRegistryKey] = registry;
  const key = `${backupDirectory}\0vite-local-api`;
  let physical = registry.get(key);
  if (!physical) {
    physical = acquireRuntimeAdmission(backupDirectory, {
      adoptCurrentProcessLegacy: true,
      scope: 'vite-local-api',
    }).then((admission) => ({ admission, references: 0 }));
    registry.set(key, physical);
    void physical.catch(() => {
      if (registry.get(key) === physical) registry.delete(key);
    });
  }
  const entry = await physical;
  if (entry.releasing) {
    await entry.releasing.catch(() => undefined);
    return acquireSharedViteAdmission(backupDirectory);
  }
  entry.references += 1;
  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      entry.references -= 1;
      if (entry.references > 0) return;
      if (entry.references < 0) throw new Error('Runtime admission reference count is invalid.');
      entry.releasing = entry.admission.release().finally(() => {
        if (registry.get(key) === physical) registry.delete(key);
      });
      await entry.releasing;
    },
  };
}
