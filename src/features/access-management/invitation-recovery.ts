export interface InvitationRecoveryTarget {
  focus: (options?: FocusOptions) => void;
  isConnected?: boolean;
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
}

export interface DialogFocusCoordinator {
  afterClose: () => void;
  request: (target: InvitationRecoveryTarget | null) => void;
}

export function createDialogFocusCoordinator(): DialogFocusCoordinator {
  let pendingTarget: InvitationRecoveryTarget | null = null;
  return {
    afterClose() {
      const target = pendingTarget;
      pendingTarget = null;
      if (!target || target.isConnected === false) return;
      target.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      target.focus({ preventScroll: true });
    },
    request(target) {
      pendingTarget = target;
    },
  };
}
