import { RefreshCw, ServerCrash, TriangleAlert, WifiOff } from 'lucide-react';
import type { LanguageOption } from '../../../i18n/language';
import type { PwaCopy } from '../copy';
import type { PwaStatusState } from '../model';

interface PwaStatusNoticeProps {
  copy: PwaCopy;
  language: LanguageOption;
  onReload: () => void;
  onRequestUpdate: () => void;
  status: PwaStatusState;
}

export function PwaStatusNotice({ copy, language, onReload, onRequestUpdate, status }: PwaStatusNoticeProps) {
  const hasCompatibilityNotice = ['incompatible', 'unavailable'].includes(status.apiCompatibility);
  if (status.isOnline && !status.update && !hasCompatibilityNotice) return null;

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
      {status.apiCompatibility === 'incompatible' && (
        <section className="pwa-status-notice pwa-status-incompatible" role="alert">
          <TriangleAlert aria-hidden="true" size={21} />
          <div>
            <strong>{copy.incompatibleTitle}</strong>
            <p>{copy.incompatibleBody}</p>
          </div>
          <button onClick={onReload} type="button">{copy.compatibilityAction}</button>
        </section>
      )}
      {status.apiCompatibility === 'unavailable' && status.isOnline && (
        <section className="pwa-status-notice pwa-status-unavailable">
          <ServerCrash aria-hidden="true" size={21} />
          <div role="status">
            <strong>{copy.unavailableTitle}</strong>
            <p>{copy.unavailableBody}</p>
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
