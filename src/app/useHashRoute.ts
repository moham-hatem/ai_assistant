import { useEffect, useState } from 'react';
import type { AppRoute } from './routes';
import { prepareCapturedPasswordRouteForHash, readBrowserRoute } from './secret-route';
import {
  enforceSpaNavigationGuard,
  guardBeforeUnload,
  guardHashLinkClick,
} from './spa-navigation-guard';

function readRoute(): AppRoute {
  return readBrowserRoute();
}

export function useHashRoute(): AppRoute {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const update = () => {
      if (enforceSpaNavigationGuard()) return;
      prepareCapturedPasswordRouteForHash(window.location.hash);
      setRoute(readRoute());
    };
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    window.addEventListener('beforeunload', guardBeforeUnload);
    document.addEventListener('click', guardHashLinkClick, true);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
      window.removeEventListener('beforeunload', guardBeforeUnload);
      document.removeEventListener('click', guardHashLinkClick, true);
    };
  }, []);

  return route;
}
