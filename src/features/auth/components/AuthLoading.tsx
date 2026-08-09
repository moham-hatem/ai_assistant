import { LoaderCircle } from 'lucide-react';
import type { AuthCopy } from '../copy';

export function AuthLoading({ copy }: { copy: AuthCopy }) {
  return <main className="auth-page"><div aria-live="polite" className="auth-state"><LoaderCircle aria-hidden="true" className="is-spinning" /><p>{copy.checking}</p></div></main>;
}
