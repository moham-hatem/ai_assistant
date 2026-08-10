export interface InvitationCancellationEvents {
  failed: (requestId: number, code: string) => void;
  started: (requestId: number, id: string) => void;
  succeeded: (requestId: number, id: string) => void;
}

export function createInvitationCancellationHandler(
  request: (id: string) => Promise<void>,
  events: InvitationCancellationEvents,
): (id: string) => Promise<boolean> {
  let pending = false;
  let requestId = 0;
  return async (id) => {
    if (pending) return false;
    pending = true;
    const currentRequest = ++requestId;
    events.started(currentRequest, id);
    try {
      await request(id);
      events.succeeded(currentRequest, id);
      return true;
    } catch (error) {
      events.failed(currentRequest, readErrorCode(error));
      return false;
    } finally {
      pending = false;
    }
  };
}

function readErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'REQUEST_FAILED';
}
