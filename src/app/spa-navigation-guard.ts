export interface NavigationSurface {
  history: Pick<History, 'replaceState' | 'state'>;
  location: Pick<Location, 'hash' | 'pathname' | 'search'>;
}

type Listener = () => void;

const leases = new Map<symbol, string>();
const listeners = new Set<Listener>();
let activeHash: string | null = null;

export function acquireSpaNavigationGuard(allowedHash: string): () => void {
  const lease = Symbol('spa-navigation-guard');
  leases.set(lease, normalizeHash(allowedHash));
  updateActiveHash();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    leases.delete(lease);
    updateActiveHash();
  };
}

export function getSpaNavigationBlocked(): boolean {
  return activeHash !== null;
}

export function subscribeSpaNavigationGuard(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function shouldBlockSpaNavigation(nextHash: string): boolean {
  return activeHash !== null && normalizeHash(nextHash) !== activeHash;
}

export function enforceSpaNavigationGuard(surface: NavigationSurface = window): boolean {
  if (!activeHash || !shouldBlockSpaNavigation(surface.location.hash)) return false;
  const cleanUrl = `${surface.location.pathname}${surface.location.search}${activeHash}`;
  surface.history.replaceState(surface.history.state, '', cleanUrl);
  return true;
}

export function guardHashLinkClick(event: MouseEvent): void {
  if (!activeHash || event.defaultPrevented || event.button !== 0) return;
  const element = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!element) return;
  const target = new URL(element.href, window.location.href);
  if (target.origin !== window.location.origin || !shouldBlockSpaNavigation(target.hash)) return;
  event.preventDefault();
}

export function guardBeforeUnload(event: BeforeUnloadEvent): void {
  if (!activeHash) return;
  event.preventDefault();
  event.returnValue = true;
}

function normalizeHash(hash: string): string {
  return hash.startsWith('#') ? hash : `#${hash}`;
}

function updateActiveHash(): void {
  const previous = activeHash;
  activeHash = Array.from(leases.values()).at(-1) ?? null;
  if (previous !== activeHash) listeners.forEach((listener) => listener());
}
