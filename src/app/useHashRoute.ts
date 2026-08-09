import { useEffect, useState } from 'react';
import type { AppRoute } from './routes';
import { readBrowserRoute } from './secret-route';

function readRoute(): AppRoute {
  return readBrowserRoute();
}

export function useHashRoute(): AppRoute {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  return route;
}
