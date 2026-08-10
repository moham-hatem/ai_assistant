import { LoaderCircle } from 'lucide-react';
import type { AppLanguage, LanguageOption } from '../../../i18n/language';

const loadingCopy: Record<AppLanguage, string> = {
  ar: 'جارٍ تحميل الصفحة…',
  en: 'Loading the page…',
  sw: 'Inapakia ukurasa…',
};

export function AsyncRouteFallback({ language }: { language: LanguageOption }) {
  return <div aria-busy="true" className="async-route-fallback" dir={language.dir}>
    <div aria-live="polite" role="status">
      <LoaderCircle aria-hidden="true" />
      <span>{loadingCopy[language.code]}</span>
    </div>
  </div>;
}
