import assert from 'node:assert/strict';
import test from 'node:test';
import { derivePermissions, hasPermission, toPrincipal } from './domain.ts';

test('permissions are deny-by-default and admin cannot approve content implicitly', () => {
  const permissions = derivePermissions(['admin']);
  assert.deepEqual(permissions, ['users:manage', 'system:admin']);
  assert.equal(permissions.includes('content:approve'), false);
  assert.equal(hasPermission(null, 'system:admin'), false);
  assert.equal(hasPermission({
    email: 'admin@example.org',
    id: 'admin',
    permissions,
    roles: ['admin'],
  }, 'content:approve'), false);
});

test('content approval requires an explicit reviewer or content-manager role', () => {
  const principal = toPrincipal({
    createdAt: '2026-01-01T00:00:00.000Z',
    email: 'admin@example.org',
    id: 'admin',
    passwordHash: 'not-exposed-by-principal',
    roles: ['admin', 'reviewer'],
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(hasPermission(principal, 'content:approve'), true);
  assert.equal('passwordHash' in principal, false);
});
