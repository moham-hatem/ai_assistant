import { createContext, type ReactNode, useContext } from 'react';
import { getLanguage, type AppLanguage } from '../../i18n/language';
import { requestPwaUpdate } from '../../pwa/update-contract';
import { PwaStatusNotice } from './components/PwaStatusNotice';
import { pwaCopies, type PwaCopy } from './copy';
import type { PwaStatusState } from './model';
import { usePwaStatus as usePwaStatusModel } from './usePwaStatus';

interface PwaStatusContextValue extends PwaStatusState {
  copy: PwaCopy;
}

const PwaStatusContext = createContext<PwaStatusContextValue | null>(null);

export function PwaStatusProvider({ children, language }: { children: ReactNode; language: AppLanguage }) {
  const status = usePwaStatusModel();
  const copy = pwaCopies[language];

  return (
    <PwaStatusContext value={{ ...status, copy }}>
      <PwaStatusNotice
        copy={copy}
        language={getLanguage(language)}
        onRequestUpdate={() => requestPwaUpdate()}
        status={status}
      />
      {children}
    </PwaStatusContext>
  );
}

export function usePwaStatus(): PwaStatusContextValue {
  const value = useContext(PwaStatusContext);
  if (!value) throw new Error('usePwaStatus must be used within PwaStatusProvider');
  return value;
}
