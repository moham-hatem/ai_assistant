import { useEffect, useState } from 'react';

export type AppRoute = 'chat' | 'knowledge';

function readRoute(): AppRoute {
  return window.location.hash === '#knowledge' ? 'knowledge' : 'chat';
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
