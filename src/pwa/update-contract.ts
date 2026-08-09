/** Fired on `window` when an installed service-worker update is waiting. */
export const PWA_UPDATE_READY_EVENT = 'daleel:pwa-update-ready';

/** Dispatch this event on `window` after the user chooses to apply the waiting update. */
export const PWA_APPLY_UPDATE_EVENT = 'daleel:pwa-apply-update';

export interface PwaUpdateReadyDetail {
  version: string | null;
}

export function requestPwaUpdate(target: Window = window): void {
  target.dispatchEvent(new Event(PWA_APPLY_UPDATE_EVENT));
}
