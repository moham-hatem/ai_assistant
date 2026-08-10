import { parseHashRoute, type AppRoute } from './routes.ts';

interface CachedPasswordRoute {
  cleanHash: string;
  route: Extract<AppRoute, { area: 'password' }>;
}

let capturedPasswordRoute: CachedPasswordRoute | null = null;

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
    clearCapturedPasswordRoute();
    return captured.route;
  }

  if (captured.route.token && captured.cleanHash) {
    capturedPasswordRoute = { cleanHash: captured.cleanHash, route: captured.route };
  } else if (capturedPasswordRoute?.cleanHash === window.location.hash) {
    return capturedPasswordRoute.route;
  } else {
    clearCapturedPasswordRoute();
  }

  if (captured.cleanHash) {
    const cleanUrl = `${window.location.pathname}${window.location.search}${captured.cleanHash}`;
    window.history.replaceState(window.history.state, '', cleanUrl);
  }
  return captured.route;
}

export function clearCapturedPasswordRoute(): void {
  capturedPasswordRoute = null;
}

export function prepareCapturedPasswordRouteForHash(hash: string): void {
  if (capturedPasswordRoute?.cleanHash !== hash) clearCapturedPasswordRoute();
}
