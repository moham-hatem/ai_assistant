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
  assert.deepEqual(parseHashRoute('#/admin/login'), { area: 'admin-login', returnTo: 'dashboard' });
  assert.deepEqual(parseHashRoute('#/admin/login?returnTo=%2Fadmin%2Freviews'), { area: 'admin-login', returnTo: 'reviews' });
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
