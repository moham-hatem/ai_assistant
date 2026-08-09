import assert from 'node:assert/strict';
import test from 'node:test';
import { adminRoutePolicy } from './admin-route-policy.ts';

const protectedRoutes = [
  ['GET', '/api/internal/books', 'books:read'],
  ['POST', '/api/internal/books', 'books:write'],
  ['GET', '/api/internal/books/book-id', 'books:read'],
  ['GET', '/api/internal/books/book-id/editions', 'books:read'],
  ['POST', '/api/internal/books/book-id/editions', 'books:write'],
  ['POST', '/api/internal/books/book-id/editions/edition-id/transition', 'books:write'],
  ['GET', '/api/internal/books/book-id/editions/edition-id/processing', 'books:read'],
  ['POST', '/api/internal/books/book-id/editions/edition-id/processing', 'books:write'],
  [
    'POST',
    '/api/internal/books/book-id/editions/edition-id/processing/approve',
    'content:review',
  ],
  ['GET', '/api/internal/question-logs', 'question_logs:read'],
  ['GET', '/api/internal/question-logs/log-id', 'question_logs:read'],
  ['GET', '/api/internal/quality-metrics', 'quality:read'],
  ['GET', '/api/internal/reviews', 'content:review'],
  ['POST', '/api/internal/reviews', 'content:review'],
  ['GET', '/api/internal/reviews/review-id', 'content:review'],
  ['POST', '/api/internal/reviews/review-id/status', 'content:review'],
  ['POST', '/api/internal/reviews/review-id/decision', 'content:review'],
  ['GET', '/api/internal/feedback', 'content:review'],
  ['GET', '/api/internal/feedback/feedback-id', 'content:review'],
  ['GET', '/api/knowledge/documents', 'books:read'],
  ['POST', '/api/knowledge/documents', 'books:write'],
  ['DELETE', '/api/knowledge/documents/document-id', 'books:write'],
  ['GET', '/api/knowledge/documents/document-id/source', 'books:read'],
  ['GET', '/api/knowledge/documents/document-id/text', 'books:read'],
] as const;

test('admin route policy maps every supported method and route to one permission', () => {
  for (const [method, pathname, permission] of protectedRoutes) {
    assert.deepEqual(
      adminRoutePolicy(method, pathname),
      { kind: 'protected', permission },
      `${method} ${pathname}`,
    );
  }
});

test('admin route policy rejects unknown and method-mismatched admin operations', () => {
  const denied = [
    ['GET', '/api/internal'],
    ['GET', '/api/internal/new-admin-api'],
    ['PUT', '/api/internal/books'],
    ['DELETE', '/api/internal/reviews/review-id'],
    ['POST', '/api/internal/question-logs'],
    ['POST', '/api/internal/quality-metrics'],
    ['GET', '/api/knowledge/documents/document-id'],
    ['PATCH', '/api/knowledge/documents/document-id'],
    ['GET', '/api/knowledge/documents/document-id/preview'],
  ] as const;

  for (const [method, pathname] of denied) {
    assert.deepEqual(adminRoutePolicy(method, pathname), { kind: 'denied' });
  }
});

test('public and auth APIs are outside the admin policy', () => {
  const publicRoutes = [
    ['POST', '/api/answer-question'],
    ['GET', '/api/version'],
    ['GET', '/api/meta/version'],
    ['POST', '/api/auth/session'],
    ['POST', '/api/feedback'],
    ['GET', '/api/knowledge/documents-public'],
  ] as const;

  for (const [method, pathname] of publicRoutes) {
    assert.deepEqual(adminRoutePolicy(method, pathname), { kind: 'public' });
  }
});
