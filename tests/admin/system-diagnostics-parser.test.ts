import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSystemDiagnosticsResponse,
  SystemDiagnosticsApiError,
} from '../../src/features/admin/system-diagnostics/api/system-diagnostics-parser.ts';
import { systemDiagnosticsPayload } from './system-diagnostics-fixtures.ts';

test('system diagnostics parser accepts the complete safe readiness contract', () => {
  const parsed = parseSystemDiagnosticsResponse(systemDiagnosticsPayload());
  assert.equal(parsed.diagnostics.status, 'healthy');
  assert.equal(parsed.diagnostics.checks.length, 10);
  assert.equal(parsed.diagnostics.versions.app, '0.1.0');
  assert.deepEqual(
    parsed.diagnostics.checks.find((check) => check.id === 'database.books')?.details?.location,
    { relativePath: 'data/books.sqlite', scope: 'workspace' },
  );
});

test('parser rejects unexpected sensitive fields and unsafe path representations', () => {
  const secretField = systemDiagnosticsPayload() as unknown as Record<string, unknown>;
  secretField.apiKey = 'must-not-appear';
  assert.throws(() => parseSystemDiagnosticsResponse(secretField), SystemDiagnosticsApiError);

  const absolutePath = systemDiagnosticsPayload();
  const books = absolutePath.diagnostics.checks.find((check) => check.id === 'database.books')!;
  books.details = {
    ...books.details,
    location: { relativePath: 'C:/private/books.sqlite', scope: 'workspace' },
  };
  assert.throws(() => parseSystemDiagnosticsResponse(absolutePath), SystemDiagnosticsApiError);

  const externalLeak = systemDiagnosticsPayload();
  externalLeak.diagnostics.checks.find((check) => check.id === 'database.books')!.details!.location = {
    relativePath: 'data/books.sqlite',
    scope: 'external',
  };
  assert.throws(() => parseSystemDiagnosticsResponse(externalLeak), SystemDiagnosticsApiError);
});

test('parser rejects missing, duplicate, contradictory, and malformed checks', () => {
  const missing = systemDiagnosticsPayload();
  missing.diagnostics.checks.pop();
  assert.throws(() => parseSystemDiagnosticsResponse(missing), SystemDiagnosticsApiError);

  const duplicate = systemDiagnosticsPayload();
  duplicate.diagnostics.checks[9] = { ...duplicate.diagnostics.checks[8] };
  assert.throws(() => parseSystemDiagnosticsResponse(duplicate), SystemDiagnosticsApiError);

  const contradictory = systemDiagnosticsPayload();
  contradictory.diagnostics.checks[0] = {
    ...contradictory.diagnostics.checks[0],
    code: 'path_unavailable',
    status: 'healthy',
  };
  assert.throws(() => parseSystemDiagnosticsResponse(contradictory), SystemDiagnosticsApiError);

  const aggregate = systemDiagnosticsPayload();
  aggregate.diagnostics.checks[8] = {
    code: 'tool_unavailable', id: 'ocr.tesseract', required: false, status: 'unavailable',
  };
  assert.throws(() => parseSystemDiagnosticsResponse(aggregate), SystemDiagnosticsApiError);
  aggregate.diagnostics.status = 'degraded';
  assert.equal(parseSystemDiagnosticsResponse(aggregate).diagnostics.status, 'degraded');
});

test('parser rejects invalid timestamps, versions, flags, and detail placement', () => {
  const invalidTimestamp = systemDiagnosticsPayload();
  invalidTimestamp.diagnostics.checkedAt = '2026-08-10 12:30:00Z';
  assert.throws(() => parseSystemDiagnosticsResponse(invalidTimestamp), SystemDiagnosticsApiError);

  const invalidVersion = systemDiagnosticsPayload();
  invalidVersion.diagnostics.versions.app = 'secret version with spaces';
  assert.throws(() => parseSystemDiagnosticsResponse(invalidVersion), SystemDiagnosticsApiError);

  const invalidRequired = systemDiagnosticsPayload();
  invalidRequired.diagnostics.checks.find((check) => check.id === 'ocr.tesseract')!.required = true;
  assert.throws(() => parseSystemDiagnosticsResponse(invalidRequired), SystemDiagnosticsApiError);

  const misplacedLocation = systemDiagnosticsPayload();
  misplacedLocation.diagnostics.checks.find((check) => check.id === 'model.configuration')!.details = {
    configured: true,
    location: { scope: 'external' },
    mode: 'remote_with_local_fallback',
  };
  assert.throws(() => parseSystemDiagnosticsResponse(misplacedLocation), SystemDiagnosticsApiError);

  const wrongModelSemantics = systemDiagnosticsPayload();
  wrongModelSemantics.diagnostics.checks.find((check) => check.id === 'model.configuration')!.details = {
    configured: false,
    mode: 'remote_with_local_fallback',
  };
  assert.throws(() => parseSystemDiagnosticsResponse(wrongModelSemantics), SystemDiagnosticsApiError);

  const misplacedCode = systemDiagnosticsPayload();
  misplacedCode.diagnostics.checks[0] = {
    code: 'configured',
    id: 'storage.data',
    required: true,
    status: 'healthy',
  };
  assert.throws(() => parseSystemDiagnosticsResponse(misplacedCode), SystemDiagnosticsApiError);
});
