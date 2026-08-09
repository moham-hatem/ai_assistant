import { RefreshCw, WifiOff } from 'lucide-react';
import type { LanguageOption } from '../../../i18n/language';
import type { PwaCopy } from '../copy';
import type { PwaStatusState } from '../model';

interface PwaStatusNoticeProps {
  copy: PwaCopy;
  language: LanguageOption;
  onRequestUpdate: () => void;
  status: PwaStatusState;
}

export function PwaStatusNotice({ copy, language, onRequestUpdate, status }: PwaStatusNoticeProps) {
  if (status.isOnline && !status.update) return null;

  return (
    <div className="pwa-status-stack" dir={language.dir}>
      {!status.isOnline && (
        <section className="pwa-status-notice pwa-status-offline" role="alert">
          <WifiOff aria-hidden="true" size={21} />
          <div>
            <strong>{copy.offlineTitle}</strong>
            <p>{copy.offlineBody}</p>
          </div>
        </section>
      )}
      {status.update && (
        <section className="pwa-status-notice pwa-status-update">
          <RefreshCw aria-hidden="true" size={21} />
          <div role="status">
            <strong>{copy.updateTitle}</strong>
            <p>{copy.updateBody}</p>
          </div>
          <button onClick={onRequestUpdate} type="button">{copy.updateAction}</button>
        </section>
      )}
    </div>
  );
}
