import type { AuthPermission } from '../../shared/contracts/auth.ts';

export type AdminRoutePolicy =
  | { kind: 'public' }
  | { kind: 'protected'; permission: AuthPermission }
  | { kind: 'denied' };

interface ProtectedRoute {
  method: string;
  path: RegExp;
  permission: AuthPermission;
}

const protectedRoutes: readonly ProtectedRoute[] = [
  route('GET', /^\/api\/internal\/books$/u, 'books:read'),
  route('POST', /^\/api\/internal\/books$/u, 'books:write'),
  route('GET', /^\/api\/internal\/books\/[^/]+$/u, 'books:read'),
  route('GET', /^\/api\/internal\/books\/[^/]+\/editions$/u, 'books:read'),
  route('POST', /^\/api\/internal\/books\/[^/]+\/editions$/u, 'books:write'),
  route(
    'POST',
    /^\/api\/internal\/books\/[^/]+\/editions\/[^/]+\/transition$/u,
    'books:write',
  ),
  route(
    'GET',
    /^\/api\/internal\/books\/[^/]+\/editions\/[^/]+\/processing$/u,
    'books:read',
  ),
  route(
    'POST',
    /^\/api\/internal\/books\/[^/]+\/editions\/[^/]+\/processing$/u,
    'books:write',
  ),
  route(
    'POST',
    /^\/api\/internal\/books\/[^/]+\/editions\/[^/]+\/processing\/approve$/u,
    'content:review',
  ),
  route('GET', /^\/api\/internal\/question-logs(?:\/[^/]+)?$/u, 'question_logs:read'),
  route('GET', /^\/api\/internal\/quality-metrics$/u, 'quality:read'),
  route('GET', /^\/api\/internal\/reviews(?:\/[^/]+)?$/u, 'content:review'),
  route('POST', /^\/api\/internal\/reviews$/u, 'content:review'),
  route('POST', /^\/api\/internal\/reviews\/[^/]+\/(?:status|decision)$/u, 'content:review'),
  route('GET', /^\/api\/internal\/feedback(?:\/[^/]+)?$/u, 'content:review'),
  route('GET', /^\/api\/knowledge\/documents$/u, 'books:read'),
  route('POST', /^\/api\/knowledge\/documents$/u, 'books:write'),
  route('DELETE', /^\/api\/knowledge\/documents\/[^/]+$/u, 'books:write'),
  route('GET', /^\/api\/knowledge\/documents\/[^/]+\/(?:source|text)$/u, 'books:read'),
];

export function adminRoutePolicy(method: string | undefined, pathname: string): AdminRoutePolicy {
  const normalizedMethod = (method ?? 'GET').toUpperCase();
  const match = protectedRoutes.find(
    (candidate) => candidate.method === normalizedMethod && candidate.path.test(pathname),
  );
  if (match) return { kind: 'protected', permission: match.permission };

  if (isAdminPath(pathname)) return { kind: 'denied' };
  return { kind: 'public' };
}

function isAdminPath(pathname: string): boolean {
  return pathname === '/api/internal'
    || pathname.startsWith('/api/internal/')
    || pathname === '/api/knowledge/documents'
    || pathname.startsWith('/api/knowledge/documents/');
}

function route(method: string, path: RegExp, permission: AuthPermission): ProtectedRoute {
  return { method, path, permission };
}
