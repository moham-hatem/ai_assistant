import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookOpen, Globe2, LockKeyhole } from 'lucide-react';
import type { AppLanguage, LanguageOption } from '../../i18n/language';
import { redeemPasswordToken } from './api/access-api';
import { passwordAccessCopies } from './password-copy';

interface PasswordAccessPageProps {
  language: AppLanguage;
  languageDetails: LanguageOption;
  mode: 'invitation' | 'recovery';
  onChooseLanguage: () => void;
  token: string | null;
}

export function PasswordAccessPage(props: PasswordAccessPageProps) {
  const copy = passwordAccessCopies[props.language];
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error' | 'success'>(props.token ? 'idle' : 'error');
  const submissionLock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordRef.current?.focus();
    return () => controller.current?.abort();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submissionLock.current || !props.token) return;
    if (password !== confirmation || new TextEncoder().encode(password).length < 12) {
      setStatus('error');
      return;
    }
    submissionLock.current = true;
    controller.current = new AbortController();
    setStatus('submitting');
    try {
      await redeemPasswordToken(props.mode, props.token, password, controller.current.signal);
      setPassword('');
      setConfirmation('');
      setStatus('success');
      window.location.replace('#/admin/login');
    } catch (error) {
      if (!isAbort(error)) setStatus('error');
    } finally {
      submissionLock.current = false;
    }
  }

  const title = props.mode === 'invitation' ? copy.titleInvitation : copy.titleRecovery;
  const intro = props.mode === 'invitation' ? copy.introInvitation : copy.introRecovery;
  const mismatch = password && confirmation && password !== confirmation;
  return (
    <main className="auth-page password-access-page" dir={props.languageDetails.dir}>
      <header className="auth-topbar">
        <a className="brand" href="#/chat"><span className="brand-mark"><BookOpen size={20} /></span><span>Daleel</span></a>
        <button className="language-switch" onClick={props.onChooseLanguage} title={copy.changeLanguage} type="button"><Globe2 size={17} /><span>{props.languageDetails.nativeLabel}</span></button>
      </header>
      <section className="login-card" aria-labelledby="password-access-title">
        <LockKeyhole aria-hidden="true" className="password-access-icon" size={25} />
        <h1 id="password-access-title">{title}</h1>
        <p>{intro}</p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="new-password">{copy.password}</label>
          <input autoComplete="new-password" id="new-password" onChange={(event) => { setPassword(event.target.value); if (status === 'error') setStatus('idle'); }} ref={passwordRef} required type="password" value={password} />
          <small className="password-policy">{copy.policy}</small>
          <label htmlFor="confirm-password">{copy.confirm}</label>
          <input aria-invalid={Boolean(mismatch)} autoComplete="new-password" id="confirm-password" onChange={(event) => { setConfirmation(event.target.value); if (status === 'error') setStatus('idle'); }} required type="password" value={confirmation} />
          {mismatch && <p className="access-inline-error" role="alert">{copy.mismatch}</p>}
          {status === 'error' && !mismatch && <p className="auth-error" role="alert">{copy.error}</p>}
          {status === 'success' && <p className="access-success" role="status">{copy.success}</p>}
          <button disabled={status === 'submitting' || status === 'success' || !props.token} type="submit">{status === 'submitting' ? copy.submitting : copy.submit}</button>
        </form>
        <a className="login-back" href="#/admin/login">{copy.back}</a>
      </section>
    </main>
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
