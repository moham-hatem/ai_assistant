export const ADMIN_UNAUTHORIZED_EVENT = 'daleel:admin-unauthorized';
export const ADMIN_FORBIDDEN_EVENT = 'daleel:admin-forbidden';

export function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, credentials: 'same-origin' }).then((response) => {
    if (typeof window !== 'undefined' && response.status === 401) window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT));
    if (typeof window !== 'undefined' && response.status === 403) window.dispatchEvent(new CustomEvent(ADMIN_FORBIDDEN_EVENT));
    return response;
  });
}

export function classifyAdminStatus(status: number): 'unauthorized' | 'forbidden' | null {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  return null;
}
