import assert from 'node:assert/strict';
import test from 'node:test';
import { adminLoginRoute, adminRoute, parseAdminReturnPage, parseHashRoute } from './routes.ts';

test('hash routes keep chat public and admin pages explicit', () => {
  assert.deepEqual(parseHashRoute('#/chat'), { area: 'public', page: 'chat' });
  assert.deepEqual(parseHashRoute('#/admin/books'), { area: 'admin', page: 'books' });
  assert.deepEqual(parseHashRoute('#/admin/question-logs'), {
    area: 'admin',
    page: 'question-logs',
  });
  assert.deepEqual(parseHashRoute('#/admin/quality'), { area: 'admin', page: 'quality' });
  assert.deepEqual(parseHashRoute('#/admin/access'), { area: 'admin', page: 'access' });
  assert.deepEqual(parseHashRoute('#/admin/security-audit'), { area: 'admin', page: 'security-audit' });
  assert.deepEqual(parseHashRoute('#/admin/backups'), { area: 'admin', page: 'backups' });
  assert.deepEqual(parseHashRoute('#/admin/system-diagnostics'), { area: 'admin', page: 'system-diagnostics' });
  assert.deepEqual(parseHashRoute('#/admin/login'), { area: 'admin-login', returnTo: 'dashboard' });
  assert.deepEqual(parseHashRoute('#/admin/login?returnTo=%2Fadmin%2Freviews'), { area: 'admin-login', returnTo: 'reviews' });
});

test('password setup and recovery routes remain public and keep their secret in memory', () => {
  assert.deepEqual(parseHashRoute('#/password-setup?invitation=secret-value'), {
    area: 'password', page: 'password-setup', token: 'secret-value',
  });
  assert.deepEqual(parseHashRoute('#/password-recovery?recovery=recovery-value'), {
    area: 'password', page: 'password-recovery', token: 'recovery-value',
  });
  assert.deepEqual(parseHashRoute('#/password-setup'), {
    area: 'password', page: 'password-setup', token: null,
  });
});

test('legacy knowledge route opens the relocated books manager', () => {
  assert.deepEqual(parseHashRoute('#knowledge'), { area: 'admin', page: 'books' });
});

test('unknown and malformed hashes fall back to public chat', () => {
  assert.deepEqual(parseHashRoute('#/admin/not-real'), { area: 'public', page: 'chat' });
  assert.deepEqual(parseHashRoute('#/admin/books/extra'), { area: 'public', page: 'chat' });
  assert.deepEqual(parseHashRoute('#anything'), { area: 'public', page: 'chat' });
});

test('admin route builder produces canonical hashes', () => {
  assert.equal(adminRoute('settings'), '#/admin/settings');
  assert.equal(adminRoute('quality'), '#/admin/quality');
  assert.equal(adminRoute('access'), '#/admin/access');
  assert.equal(adminRoute('security-audit'), '#/admin/security-audit');
  assert.equal(adminRoute('backups'), '#/admin/backups');
  assert.equal(adminRoute('system-diagnostics'), '#/admin/system-diagnostics');
  assert.equal(adminLoginRoute('books'), '#/admin/login?returnTo=%2Fadmin%2Fbooks');
});

test('admin login return paths are strictly allowlisted', () => {
  assert.equal(parseAdminReturnPage('/admin/books'), 'books');
  assert.equal(parseAdminReturnPage('#/admin/reviews'), 'reviews');
  assert.equal(parseAdminReturnPage('https://evil.example/admin/books'), null);
  assert.equal(parseAdminReturnPage('/admin/login'), null);
  assert.equal(parseAdminReturnPage('/admin/books/extra'), null);
  assert.deepEqual(parseHashRoute('#/admin/login?returnTo=https%3A%2F%2Fevil.example'), { area: 'admin-login', returnTo: 'dashboard' });
});
