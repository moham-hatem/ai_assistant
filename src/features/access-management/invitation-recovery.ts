export interface InvitationRecoveryTarget {
  focus: (options?: FocusOptions) => void;
  scrollIntoView: (options?: ScrollIntoViewOptions) => void;
}

export function revealActiveInvitations(
  closeDialog: () => void,
  target: InvitationRecoveryTarget | null,
): void {
  closeDialog();
  queueMicrotask(() => {
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.focus({ preventScroll: true });
  });
}
