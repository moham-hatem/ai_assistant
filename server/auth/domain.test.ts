import assert from 'node:assert/strict';
import test from 'node:test';
import {
  derivePermissions,
  hasPermission,
  normalizeDisplayName,
  toPrincipal,
} from './domain.ts';

test('permissions are deny-by-default and admin cannot approve content implicitly', () => {
  const permissions = derivePermissions(['admin']);
  assert.deepEqual(permissions, ['settings:manage']);
  assert.equal(permissions.includes('content:review'), false);
  assert.equal(hasPermission(null, 'settings:manage'), false);
  assert.equal(hasPermission({
    displayName: 'Local Admin',
    email: 'admin@example.org',
    id: 'admin',
    permissions,
    roles: ['admin'],
  }, 'content:review'), false);
});

test('roles map exactly to the least-privilege API gateway permissions', () => {
  assert.deepEqual(derivePermissions(['reviewer']), ['content:review']);
  assert.deepEqual(derivePermissions(['content_manager']), [
    'books:read',
    'books:write',
    'content:review',
    'question_logs:read',
    'quality:read',
  ]);
  assert.deepEqual(derivePermissions(['operator']), [
    'books:read',
    'question_logs:read',
    'quality:read',
  ]);
  const principal = toPrincipal({
    createdAt: '2026-01-01T00:00:00.000Z',
    displayName: 'Local Admin',
    email: 'admin@example.org',
    id: 'admin',
    passwordHash: 'not-exposed-by-principal',
    roles: ['admin', 'reviewer'],
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(hasPermission(principal, 'content:review'), true);
  assert.equal(principal.displayName, 'Local Admin');
  assert.equal('passwordHash' in principal, false);
});

test('display names are normalized and reject blank, control, and oversized values', () => {
  assert.equal(normalizeDisplayName('  مُراجع\tمحلي  '), 'مُراجع محلي');
  assert.equal(normalizeDisplayName('   '), undefined);
  assert.equal(normalizeDisplayName('Unsafe\u202ename'), undefined);
  assert.equal(normalizeDisplayName('a'.repeat(81)), undefined);
  assert.equal(normalizeDisplayName('ع'.repeat(80)), 'ع'.repeat(80));
  assert.equal(normalizeDisplayName('𐍈'.repeat(41)), undefined);
});
