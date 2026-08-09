import { parseHashRoute, type AppRoute } from './routes.ts';

let capturedPasswordRoute: Extract<AppRoute, { area: 'password' }> | null = null;

export interface CapturedHashRoute {
  cleanHash: string | null;
  route: AppRoute;
}

export function captureHashRoute(hash: string): CapturedHashRoute {
  const route = parseHashRoute(hash);
  if (route.area !== 'password') return { cleanHash: null, route };
  return {
    cleanHash: hash.includes('?') ? `#/${route.page}` : null,
    route,
  };
}

export function readBrowserRoute(): AppRoute {
  const captured = captureHashRoute(window.location.hash);
  if (captured.route.area !== 'password') {
    capturedPasswordRoute = null;
    return captured.route;
  }

  if (captured.route.token) capturedPasswordRoute = captured.route;
  const route = capturedPasswordRoute?.page === captured.route.page
    ? capturedPasswordRoute
    : captured.route;
  if (captured.cleanHash) {
    const cleanUrl = `${window.location.pathname}${window.location.search}${captured.cleanHash}`;
    window.history.replaceState(window.history.state, '', cleanUrl);
  }
  return route;
}
