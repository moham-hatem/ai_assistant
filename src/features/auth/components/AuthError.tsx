import type { AuthCopy } from '../copy';

export function AuthError({ copy, onRetry }: { copy: AuthCopy; onRetry: () => void }) {
  return <main className="auth-page"><div className="auth-state" role="alert"><p>{copy.sessionError}</p><button onClick={onRetry} type="button">{copy.retry}</button></div></main>;
}
