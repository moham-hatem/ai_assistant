import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { safeDiagnosticLocation } from './safe-location.ts';

test('safe diagnostic locations expose only workspace data paths', () => {
  const root = resolve('C:/private/application');
  assert.deepEqual(safeDiagnosticLocation(root, resolve(root, 'data/books.sqlite')), {
    relativePath: 'data/books.sqlite',
    scope: 'workspace',
  });
  assert.deepEqual(safeDiagnosticLocation(root, resolve(root, '.secrets/admin.sqlite')), {
    scope: 'workspace',
  });
  assert.deepEqual(safeDiagnosticLocation(root, resolve('D:/customer/private.sqlite')), {
    scope: 'external',
  });
  assert.deepEqual(safeDiagnosticLocation(root, ':memory:'), { scope: 'memory' });
});
