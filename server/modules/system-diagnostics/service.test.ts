import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import type { SecurityAuditIntegritySummary } from '../../../shared/contracts/security-audit.ts';
import type { LocalDiagnosticProbePorts, PathInspection, ToolInspection } from './local-probes.ts';
import { SystemDiagnosticsService, type SystemDiagnosticsOptions } from './service.ts';

const validIntegrity: SecurityAuditIntegritySummary = {
  assurance: 'local_authenticated_head',
  checkedAt: '2026-08-10T12:00:00.000Z',
  checkedEvents: 8,
  externallyAnchored: false,
  firstInvalidSequence: null,
  keyVersions: ['v1'],
  status: 'valid',
  totalEvents: 8,
};

test('system diagnostics reports a healthy, versioned local runtime', async () => {
  const service = new SystemDiagnosticsService(
    options(),
    probes(readyPath(), 'available'),
    () => new Date('2026-08-10T12:30:00.000Z'),
  );
  const report = await service.inspect();
  assert.equal(report.status, 'healthy');
  assert.equal(report.checkedAt, '2026-08-10T12:30:00.000Z');
  assert.deepEqual(report.versions, { api: '1', app: '0.1.0' });
  assert.equal(report.checks.length, 11);
  assert.ok(report.checks.every((check) => check.status === 'healthy'));
  assert.equal(report.checks.find((check) => check.id === 'audit.integrity')?.code, 'integrity_valid');
});

test('optional OCR failure and uninitialized paths degrade without hiding required failures', async () => {
  const missing: PathInspection = {
    availableSpaceMiB: 512,
    exists: false,
    kind: 'file',
    readable: false,
    writable: true,
  };
  const ports = probes(readyPath(), 'unavailable');
  ports.inspectPath = async (path, expected) => path.endsWith('books.sqlite')
    ? missing
    : { ...readyPath(), kind: expected === 'database' ? 'file' : 'directory' };
  const report = await new SystemDiagnosticsService(options(), ports).inspect();
  assert.equal(report.status, 'degraded');
  assert.equal(report.checks.find((check) => check.id === 'database.books')?.code, 'not_initialized');
  assert.equal(report.checks.find((check) => check.id === 'ocr.tesseract')?.required, false);
});

test('invalid audit integrity makes readiness unavailable and output stays sanitized', async () => {
  const privateRoot = resolve('C:/private/workspace');
  const privateExternal = resolve('D:/customers/acme/secret.sqlite');
  const configured = options(privateRoot);
  configured.appVersion = 'secret token must not leak';
  configured.databases = [
    { id: 'database.books', path: privateExternal },
    ...configured.databases.slice(1),
  ];
  configured.audit.verifyIntegrity = async () => ({
    ...validIntegrity,
    firstInvalidSequence: 2,
    status: 'invalid',
  });
  const report = await new SystemDiagnosticsService(configured, probes(readyPath(), 'available')).inspect();
  const serialized = JSON.stringify(report);
  assert.equal(report.status, 'unavailable');
  assert.equal(report.versions.app, 'unknown');
  assert.equal(serialized.includes('customers'), false);
  assert.equal(serialized.includes('secret.sqlite'), false);
  assert.equal(serialized.includes('token must not leak'), false);
  assert.deepEqual(
    report.checks.find((check) => check.id === 'database.books')?.details?.location,
    { scope: 'external' },
  );
});

test('audit checks time out within the configured bound', async () => {
  const configured = options();
  configured.probeTimeoutMs = 100;
  configured.audit.verifyIntegrity = () => new Promise(() => undefined);
  const started = Date.now();
  const report = await new SystemDiagnosticsService(configured, probes(readyPath(), 'available')).inspect();
  assert.equal(report.checks.find((check) => check.id === 'audit.integrity')?.code, 'integrity_probe_timeout');
  assert.equal(report.status, 'unavailable');
  assert.ok(Date.now() - started < 1_000);
});

test('filesystem probes are bounded and cannot hold the diagnostics request open', async () => {
  const configured = options();
  configured.probeTimeoutMs = 100;
  const ports = probes(readyPath(), 'available');
  ports.inspectPath = () => new Promise(() => undefined);
  const started = Date.now();
  const report = await new SystemDiagnosticsService(configured, ports).inspect();
  assert.equal(report.status, 'unavailable');
  assert.ok(report.checks
    .filter((check) => check.id.startsWith('storage.') || check.id.startsWith('database.'))
    .every((check) => check.code === 'path_probe_timeout'));
  assert.ok(Date.now() - started < 1_000);
});

test('Telegram diagnostics expose only a safe fresh public runtime snapshot', async () => {
  const configured = options();
  configured.telegram.readStatus = async () => ({
    kind: 'available',
    snapshot: {
      configured: true,
      lastHandledUpdateAt: '2026-08-10T12:29:58.000Z',
      lastSuccessfulPoll: '2026-08-10T12:29:59.000Z',
      publicLink: 'https://t.me/LearningHelperBot',
      publicUsername: 'LearningHelperBot',
      retryCount: 0,
      state: 'running',
      updatedAt: '2026-08-10T12:30:00.000Z',
      version: 1,
    },
  });
  const report = await new SystemDiagnosticsService(
    configured, probes(readyPath(), 'available'),
  ).inspect();
  const telegram = report.checks.find((check) => check.id === 'telegram.bot');
  assert.equal(telegram?.code, 'telegram_running');
  assert.deepEqual(telegram?.details, {
    configured: true,
    lastHandledUpdateAt: '2026-08-10T12:29:58.000Z',
    lastSuccessfulPoll: '2026-08-10T12:29:59.000Z',
    publicLink: 'https://t.me/LearningHelperBot',
    publicUsername: 'LearningHelperBot',
    retryCount: 0,
    running: true,
    runtimeState: 'running',
  });
  assert.equal(JSON.stringify(telegram).includes('token'), false);
});

test('missing, stale, and invalid Telegram snapshots degrade safely without network errors', async () => {
  const configured = options();
  configured.telegram.readStatus = async () => ({ kind: 'missing' });
  let report = await new SystemDiagnosticsService(configured, probes(readyPath(), 'available')).inspect();
  assert.equal(report.checks.find((check) => check.id === 'telegram.bot')?.code, 'telegram_status_missing');
  assert.equal(report.status, 'degraded');

  configured.telegram.readStatus = async () => ({
    kind: 'stale',
    snapshot: {
      configured: true,
      errorCode: 'network_unavailable',
      retryCount: 4,
      state: 'degraded',
      updatedAt: '2026-08-10T12:00:00.000Z',
      version: 1,
    },
  });
  report = await new SystemDiagnosticsService(configured, probes(readyPath(), 'available')).inspect();
  assert.equal(report.checks.find((check) => check.id === 'telegram.bot')?.code, 'telegram_status_stale');
  assert.equal(report.checks.find((check) => check.id === 'telegram.bot')?.details?.running, false);

  configured.telegram.readStatus = async () => ({ kind: 'invalid' });
  report = await new SystemDiagnosticsService(configured, probes(readyPath(), 'available')).inspect();
  assert.equal(report.checks.find((check) => check.id === 'telegram.bot')?.code, 'telegram_status_invalid');
});

function options(root = resolve('C:/private/workspace')): SystemDiagnosticsOptions {
  return {
    appVersion: '0.1.0',
    audit: { configured: true, verifyIntegrity: async () => validIntegrity },
    databases: [
      { id: 'database.books', path: resolve(root, 'data/books.sqlite') },
      { id: 'database.questions', path: resolve(root, 'data/questions.sqlite') },
      { id: 'database.auth', path: resolve(root, 'data/auth.sqlite') },
    ],
    model: { localConfigured: true, remoteConfigured: true },
    ocr: { pdftoppmPath: 'pdftoppm-private-path', tesseractPath: 'tesseract-private-path' },
    paths: {
      data: resolve(root, 'data'),
      documents: resolve(root, 'data/documents'),
      knowledge: resolve(root, 'data/knowledge'),
    },
    telegram: {
      readStatus: async () => ({
        kind: 'available',
        snapshot: {
          configured: true,
          retryCount: 0,
          state: 'running',
          updatedAt: '2026-08-10T12:30:00.000Z',
          version: 1,
        },
      }),
    },
    workspaceRoot: root,
  };
}

function readyPath(): PathInspection {
  return {
    availableSpaceMiB: 4_096,
    exists: true,
    kind: 'directory',
    readable: true,
    sqliteHeader: true,
    writable: true,
  };
}

function probes(pathResult: PathInspection, toolResult: ToolInspection): LocalDiagnosticProbePorts {
  return {
    inspectPath: async (_path, expected) => ({
      ...pathResult,
      kind: expected === 'database' ? 'file' : 'directory',
    }),
    inspectTool: async () => toolResult,
  };
}
