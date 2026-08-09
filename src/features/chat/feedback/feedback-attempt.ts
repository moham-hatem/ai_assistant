export function createFeedbackAttempt(
  createId: () => string = () => crypto.randomUUID(),
) {
  let active = false;

  return {
    open(): string | null {
      if (active) return null;
      active = true;
      return createId();
    },
    reset() {
      active = false;
    },
  };
}
