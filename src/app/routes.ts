export const ADMIN_PAGES = [
  'dashboard',
  'books',
  'reviews',
  'question-logs',
  'quality',
  'settings',
] as const;

export type AdminPage = (typeof ADMIN_PAGES)[number];

export type AppRoute =
  | { area: 'public'; page: 'chat' }
  | { area: 'admin'; page: AdminPage }
  | { area: 'admin-login'; returnTo: AdminPage };

const PUBLIC_CHAT_ROUTE: AppRoute = { area: 'public', page: 'chat' };

export function parseHashRoute(hash: string): AppRoute {
  const [rawPath, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const path = rawPath.replace(/\/+$/, '');

  if (path === 'admin/login') {
    const requested = new URLSearchParams(query).get('returnTo');
    return { area: 'admin-login', returnTo: parseAdminReturnPage(requested) ?? 'dashboard' };
  }

  if (path === 'knowledge') {
    return { area: 'admin', page: 'books' };
  }

  if (path === 'admin') {
    return { area: 'admin', page: 'dashboard' };
  }

  const [area, page, ...rest] = path.split('/');
  if (area === 'admin' && rest.length === 0 && isAdminPage(page)) {
    return { area: 'admin', page };
  }

  return PUBLIC_CHAT_ROUTE;
}

export function adminRoute(page: AdminPage): string {
  return `#/admin/${page}`;
}

export function adminLoginRoute(returnTo: AdminPage = 'dashboard'): string {
  return `#/admin/login?returnTo=${encodeURIComponent(`/admin/${returnTo}`)}`;
}

export function parseAdminReturnPage(value: string | null | undefined): AdminPage | null {
  if (!value) return null;
  const normalized = value.replace(/^#/, '').replace(/\/+$/, '');
  const match = /^\/admin\/([^/?#]+)$/.exec(normalized);
  return match && isAdminPage(match[1]) ? match[1] : null;
}

function isAdminPage(value: string | undefined): value is AdminPage {
  return ADMIN_PAGES.some((page) => page === value);
}
