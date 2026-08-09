import { AlertCircle, BookOpen, Globe2, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LanguageOption } from '../../../i18n/language';
import { AuthApiError } from '../api';
import type { AuthCopy } from '../copy';
import { canSubmitLogin } from '../login-state';

interface LoginPageProps {
  copy: AuthCopy; language: LanguageOption; onChooseLanguage: () => void;
  onLogin: (email: string, password: string) => Promise<void>; onSuccess: () => void;
}

export function LoginPage({ copy, language, onChooseLanguage, onLogin, onSuccess }: LoginPageProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if (!canSubmitLogin(busy, email, password)) return;
    setBusy(true); setError(null);
    try { await onLogin(email, password); onSuccess(); }
    catch (caught) { setError(messageFor(caught, copy)); setBusy(false); }
  }

  return (
    <main className="auth-page" dir={language.dir}>
      <header className="auth-topbar">
        <a className="brand" href="#/chat"><span className="brand-mark"><BookOpen size={22} /></span><span>Daleel</span></a>
        <button className="language-switch" onClick={onChooseLanguage} type="button"><Globe2 size={17} /><span>{language.nativeLabel}</span></button>
      </header>
      <section className="login-card" aria-labelledby="login-title">
        <span className="login-eyebrow">{copy.admin}</span><h1 id="login-title">{copy.title}</h1><p>{copy.intro}</p>
        {error && <div className="auth-error" ref={errorRef} role="alert" tabIndex={-1}><AlertCircle size={18} /><span>{error}</span></div>}
        <form aria-busy={busy} onSubmit={submit}>
          <label htmlFor="team-email">{copy.email}</label>
          <input autoComplete="username" autoFocus id="team-email" inputMode="email" name="email" required type="email" />
          <label htmlFor="team-password">{copy.password}</label>
          <input autoComplete="current-password" id="team-password" name="password" required type="password" />
          <button disabled={busy} type="submit">{busy && <LoaderCircle aria-hidden="true" className="is-spinning" size={18} />}{busy ? copy.signingIn : copy.signIn}</button>
        </form>
        <a className="login-back" href="#/chat">{copy.back}</a>
      </section>
    </main>
  );
}

function messageFor(error: unknown, copy: AuthCopy): string {
  if (!(error instanceof AuthApiError)) return copy.unavailable;
  if (error.code === 'invalid_credentials') return copy.invalidCredentials;
  if (error.code === 'invalid_response') return copy.invalidResponse;
  return copy.unavailable;
}
