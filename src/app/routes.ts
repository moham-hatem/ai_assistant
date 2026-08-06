export const ADMIN_PAGES = [
  'dashboard',
  'books',
  'reviews',
  'question-logs',
  'settings',
] as const;

export type AdminPage = (typeof ADMIN_PAGES)[number];

export type AppRoute =
  | { area: 'public'; page: 'chat' }
  | { area: 'admin'; page: AdminPage };

const PUBLIC_CHAT_ROUTE: AppRoute = { area: 'public', page: 'chat' };

export function parseHashRoute(hash: string): AppRoute {
  const path = hash.replace(/^#\/?/, '').replace(/\/+$/, '');

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

function isAdminPage(value: string | undefined): value is AdminPage {
  return ADMIN_PAGES.some((page) => page === value);
}
