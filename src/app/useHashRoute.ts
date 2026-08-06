import { useEffect, useState } from 'react';
import { parseHashRoute, type AppRoute } from './routes';

function readRoute(): AppRoute {
  return parseHashRoute(window.location.hash);
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
