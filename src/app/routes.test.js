import assert from 'node:assert/strict';
import test from 'node:test';
import { adminRoute, parseHashRoute } from './routes.ts';

test('hash routes keep chat public and admin pages explicit', () => {
  assert.deepEqual(parseHashRoute('#/chat'), { area: 'public', page: 'chat' });
  assert.deepEqual(parseHashRoute('#/admin/books'), { area: 'admin', page: 'books' });
  assert.deepEqual(parseHashRoute('#/admin/question-logs'), {
    area: 'admin',
    page: 'question-logs',
  });
  assert.deepEqual(parseHashRoute('#/admin/quality'), { area: 'admin', page: 'quality' });
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
});
