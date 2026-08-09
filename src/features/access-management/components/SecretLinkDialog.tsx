import { useRef, useState } from 'react';
import { AlertTriangle, Copy } from 'lucide-react';
import type { SecretLinkResponse } from '../../../../shared/contracts/access-management';
import type { AccessCopy } from '../access-copy';
import { AccessDialog } from './AccessDialog';

interface SecretLinkDialogProps {
  copy: AccessCopy;
  kind: 'invitation' | 'recovery';
  onClose: () => void;
  secret: SecretLinkResponse;
}

export function SecretLinkDialog({ copy, kind, onClose, secret }: SecretLinkDialogProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(secret.link);
      setCopyStatus('copied');
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopyStatus('failed');
    }
  }

  const title = kind === 'invitation' ? copy.secret.invitationTitle : copy.secret.recoveryTitle;
  return (
    <AccessDialog closeLabel={copy.actions.close} descriptionId="secret-link-warning" onClose={onClose} title={title}>
      <div className="access-secret-warning" id="secret-link-warning" role="alert"><AlertTriangle size={21} /><p>{copy.secret.warning}</p></div>
      <label className="access-secret-label" htmlFor="secret-link">{title}</label>
      <div className="access-secret-field">
        <input dir="ltr" id="secret-link" onFocus={(event) => event.currentTarget.select()} readOnly ref={inputRef} value={secret.link} />
        <button className="access-primary" onClick={() => void copyLink()} type="button"><Copy size={17} />{copy.actions.copy}</button>
      </div>
      <p className="access-secret-expiry">{copy.expires}: <time dateTime={secret.expiresAt}>{new Date(secret.expiresAt).toLocaleString()}</time></p>
      {copyStatus === 'copied' && <p className="access-success" role="status">{copy.actions.copied}</p>}
      {copyStatus === 'failed' && <p className="access-inline-error" role="alert">{copy.secret.copyFailed}</p>}
      <div className="access-dialog-actions"><button className="access-secondary" onClick={onClose} type="button">{copy.actions.close}</button></div>
    </AccessDialog>
  );
}
