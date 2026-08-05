import { useEffect, useState } from 'react';
import { BookOpen, Globe2, ShieldCheck } from 'lucide-react';
import { LanguageGate } from '../features/language/LanguageGate';
import { getLanguage, isAppLanguage, type AppLanguage } from '../i18n/language';
import { translations } from '../i18n/translations';
import { ChatPage } from '../pages/ChatPage';
import { KnowledgePage } from '../pages/KnowledgePage';
import { useHashRoute } from './useHashRoute';

export function App() {
  const route = useHashRoute();
  const [language, setLanguage] = useState<AppLanguage | null>(readSavedLanguage);
  const [isChoosingLanguage, setIsChoosingLanguage] = useState(language === null);
  const activeLanguage = language ?? 'ar';
  const copy = translations[activeLanguage];
  const languageDetails = getLanguage(activeLanguage);

  useEffect(() => {
    document.documentElement.lang = activeLanguage;
    document.documentElement.dir = languageDetails.dir;
    document.title = activeLanguage === 'ar'
      ? 'دليل | المساعد التعليمي الإسلامي'
      : activeLanguage === 'sw'
        ? 'Daleel | Msaidizi wa elimu ya Kiislamu'
        : 'Daleel | Islamic learning assistant';
  }, [activeLanguage, languageDetails.dir]);

  function chooseLanguage(nextLanguage: AppLanguage) {
    localStorage.setItem('daleel-language', nextLanguage);
    setLanguage(nextLanguage);
    setIsChoosingLanguage(false);
  }

  if (isChoosingLanguage || language === null) {
    return (
      <LanguageGate
        current={language ?? undefined}
        onSelect={chooseLanguage}
        translations={copy}
      />
    );
  }

  return (
    <main className="page-shell" dir={languageDetails.dir}>
      <header className="site-header">
        <a className="brand" href="#chat" aria-label={copy.brandAria}>
          <span className="brand-mark"><BookOpen size={22} /></span>
          <span>{activeLanguage === 'ar' ? 'دليل' : 'Daleel'}</span>
        </a>
        <nav className="site-nav" aria-label={copy.assistant}>
          <a aria-current={route === 'chat' ? 'page' : undefined} href="#chat">{copy.assistant}</a>
          <a aria-current={route === 'knowledge' ? 'page' : undefined} href="#knowledge">{copy.books}</a>
        </nav>
        <div className="header-actions">
          <span className="header-note"><ShieldCheck size={16} /> {copy.localContent}</span>
          <button
            className="language-switch"
            onClick={() => setIsChoosingLanguage(true)}
            title={copy.changeLanguage}
            type="button"
          >
            <Globe2 size={17} />
            <span>{languageDetails.nativeLabel}</span>
          </button>
        </div>
      </header>

      {route === 'knowledge' ? <KnowledgePage /> : <ChatPage language={activeLanguage} copy={copy} />}
    </main>
  );
}

function readSavedLanguage(): AppLanguage | null {
  const saved = localStorage.getItem('daleel-language');
  return isAppLanguage(saved) ? saved : null;
}
