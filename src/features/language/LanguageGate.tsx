import { Check, Languages } from 'lucide-react';
import { languages, type AppLanguage } from '../../i18n/language';
import type { AppTranslations } from '../../i18n/translations';

interface LanguageGateProps {
  current?: AppLanguage;
  onSelect: (language: AppLanguage) => void;
  translations: AppTranslations;
}

export function LanguageGate({ current, onSelect, translations }: LanguageGateProps) {
  return (
    <main className="language-gate">
      <section className="language-card" aria-labelledby="language-title">
        <span className="language-icon" aria-hidden="true"><Languages size={28} /></span>
        <p className="language-kicker">العربية · English · Kiswahili</p>
        <h1 id="language-title">{translations.selectLanguageTitle}</h1>
        <p>{translations.selectLanguageBody}</p>
        <div className="language-options">
          {languages.map((language) => (
            <button
              className="language-option"
              key={language.code}
              onClick={() => onSelect(language.code)}
              type="button"
            >
              <span>
                <strong>{language.nativeLabel}</strong>
                <small>{language.label}</small>
              </span>
              {current === language.code && <Check size={20} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
