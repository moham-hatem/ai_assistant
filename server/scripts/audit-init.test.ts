import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { initializeSecurityAuditKey, WINDOWS_ACL_WARNING } from './audit-init.ts';

const knownBytes = Buffer.alloc(32, 0xa5);
const knownKey = knownBytes.toString('base64url');

test('audit:init creates .env.local without printing the generated secret', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'ila-audit-init-'));
  context.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  });
  const messages: string[] = [];

  await initializeSecurityAuditKey({
    cwd: directory,
    generateKey: () => knownBytes,
    log: (message) => messages.push(message),
    warn: () => undefined,
  });

  assert.equal(await readFile(join(directory, '.env.local'), 'utf8'), `SECURITY_AUDIT_HMAC_KEY=${knownKey}\n`);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].includes(knownKey), false);
});

test('audit:init replaces an empty placeholder and preserves Windows line endings', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'ila-audit-init-'));
  context.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  });
  const envPath = join(directory, '.env.local');
  await writeFile(envPath, 'OPENCODE_API_KEY=local\r\nSECURITY_AUDIT_HMAC_KEY=\r\nAUTH_PUBLIC_ORIGIN=http://127.0.0.1:5173\r\n');

  await initializeSecurityAuditKey({
    cwd: directory, generateKey: () => knownBytes, log: () => undefined, warn: () => undefined,
  });

  assert.equal(await readFile(envPath, 'utf8'), `OPENCODE_API_KEY=local\r\nSECURITY_AUDIT_HMAC_KEY=${knownKey}\r\nAUTH_PUBLIC_ORIGIN=http://127.0.0.1:5173\r\n`);
});

test('audit:init refuses to overwrite an existing key', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'ila-audit-init-'));
  context.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  });
  const envPath = join(directory, '.env.local');
  const original = 'SECURITY_AUDIT_HMAC_KEY=existing-secret\n';
  await writeFile(envPath, original);

  await assert.rejects(
    initializeSecurityAuditKey({
      cwd: directory, generateKey: () => knownBytes, log: () => undefined, warn: () => undefined,
    }),
    /refusing to overwrite/u,
  );
  assert.equal(await readFile(envPath, 'utf8'), original);
});

test('audit:init rejects short generators and concurrent writers without touching the env file', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'ila-audit-init-'));
  context.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  });
  const envPath = join(directory, '.env.local');
  await writeFile(envPath, 'OPENCODE_API_KEY=local\n');
  await assert.rejects(
    initializeSecurityAuditKey({
      cwd: directory, generateKey: () => Buffer.alloc(31), log: () => undefined,
      warn: () => undefined,
    }),
    /at least 32 bytes/u,
  );
  assert.equal(await readFile(envPath, 'utf8'), 'OPENCODE_API_KEY=local\n');

  const lockPath = join(directory, '.env.local.audit-init.lock');
  await writeFile(lockPath, 'locked');
  await assert.rejects(
    initializeSecurityAuditKey({ cwd: directory, generateKey: () => knownBytes }),
    /another audit:init process/iu,
  );
  assert.equal(await readFile(envPath, 'utf8'), 'OPENCODE_API_KEY=local\n');
});

for (const failure of ['write', 'rename'] as const) {
  test(`audit:init ${failure} failure preserves the original bytes and removes its sibling temp`, async (context) => {
    const directory = await mkdtemp(join(tmpdir(), 'ila-audit-init-atomic-'));
    context.after(async () => {
      const { rm } = await import('node:fs/promises');
      await rm(directory, { recursive: true, force: true });
    });
    const envPath = join(directory, '.env.local');
    const original = Buffer.from('\uFEFFOPENCODE_API_KEY=unchanged\r\nSECURITY_AUDIT_HMAC_KEY=\r\n');
    await writeFile(envPath, original);
    const injected = new Error(`injected ${failure} failure`);

    await assert.rejects(initializeSecurityAuditKey({
      cwd: directory,
      generateKey: () => knownBytes,
      log: () => undefined,
      warn: () => undefined,
      ...(failure === 'write' ? {
        writeTemp: async (handle) => {
          await handle.writeFile('partial', 'utf8');
          throw injected;
        },
      } : {
        renameFile: async () => { throw injected; },
      }),
    }), injected);

    assert.deepEqual(await readFile(envPath), original);
    assert.deepEqual(
      (await readdir(directory)).filter((name) => name.includes('.audit-init.')),
      [],
    );
  });
}

test('audit:init recovers a stale lock after the documented timeout', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'ila-audit-init-stale-'));
  context.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  });
  const lockPath = join(directory, '.env.local.audit-init.lock');
  await writeFile(lockPath, 'stale');
  await utimes(lockPath, new Date(0), new Date(0));

  await initializeSecurityAuditKey({
    cwd: directory,
    generateKey: () => knownBytes,
    log: () => undefined,
    now: () => 20 * 60_000,
    staleLockMs: 10 * 60_000,
    warn: () => undefined,
  });

  assert.equal(await readFile(join(directory, '.env.local'), 'utf8'), `SECURITY_AUDIT_HMAC_KEY=${knownKey}\n`);
  assert.deepEqual(await readdir(directory), ['.env.local']);
});

test('audit:init emits a stable secret-free Windows ACL warning', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'ila-audit-init-windows-'));
  context.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  });
  const warnings: string[] = [];

  await initializeSecurityAuditKey({
    cwd: directory,
    generateKey: () => knownBytes,
    log: () => undefined,
    platform: 'win32',
    warn: (message) => warnings.push(message),
  });

  assert.deepEqual(warnings, [WINDOWS_ACL_WARNING]);
  assert.equal(warnings[0]?.includes(knownKey), false);
});

test('.env.local is ignored so generated keys cannot be committed accidentally', async () => {
  const ignore = await readFile(resolve(import.meta.dirname, '..', '..', '.gitignore'), 'utf8');
  assert.match(ignore, /^\.env\.local\s*$/mu);
  assert.match(ignore, /^\.env\.local\.audit-init\.lock\s*$/mu);
  assert.match(ignore, /^\.env\.local\.audit-init\.\*\.tmp\s*$/mu);
});
