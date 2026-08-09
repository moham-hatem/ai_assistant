import { useEffect, useState } from 'react';
import { BookOpen, Globe2, ShieldCheck } from 'lucide-react';
import { AdminApp } from '../features/admin/AdminApp';
import { LanguageGate } from '../features/language/LanguageGate';
import { getLanguage, isAppLanguage, type AppLanguage } from '../i18n/language';
import { translations } from '../i18n/translations';
import { ChatPage } from '../pages/ChatPage';
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
    const section = route.area === 'admin' ? 'Admin' : copy.assistant;
    document.title = activeLanguage === 'ar'
      ? `دليل | ${route.area === 'admin' ? 'لوحة الإدارة' : 'المساعد التعليمي الإسلامي'}`
      : `Daleel | ${section}`;
  }, [activeLanguage, copy.assistant, languageDetails.dir, route.area]);

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

  if (route.area === 'admin') {
    return (
      <AdminApp
        language={activeLanguage}
        languageDetails={languageDetails}
        onChooseLanguage={() => setIsChoosingLanguage(true)}
        page={route.page}
      />
    );
  }

  return (
    <main className="page-shell" dir={languageDetails.dir}>
      <header className="site-header">
        <a className="brand" href="#/chat" aria-label={copy.brandAria}>
          <span className="brand-mark"><BookOpen size={22} /></span>
          <span>{activeLanguage === 'ar' ? 'دليل' : 'Daleel'}</span>
        </a>
        <nav className="site-nav" aria-label={copy.assistant}>
          <a aria-current="page" href="#/chat">{copy.assistant}</a>
          <a href="#/admin/dashboard">{copy.adminPanel}</a>
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

      <ChatPage language={activeLanguage} copy={copy} />
    </main>
  );
}

function readSavedLanguage(): AppLanguage | null {
  const saved = localStorage.getItem('daleel-language');
  return isAppLanguage(saved) ? saved : null;
}
