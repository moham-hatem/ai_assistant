import { useEffect, useState } from 'react';
import { BookOpen, Globe2, ShieldCheck } from 'lucide-react';
import { AuthProvider } from '../features/auth/AuthProvider';
import { AdminGate } from '../features/auth/components/AdminGate';
import { useAuth } from '../features/auth/useAuth';
import { LanguageGate } from '../features/language/LanguageGate';
import { PwaStatusProvider } from '../features/pwa/PwaStatusProvider';
import { getLanguage, isAppLanguage, type AppLanguage } from '../i18n/language';
import { translations } from '../i18n/translations';
import { ChatPage } from '../pages/ChatPage';
import { PasswordAccessPage } from '../features/access-management/PasswordAccessPage';
import { useHashRoute } from './useHashRoute';

export function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}

function AppContent() {
  const route = useHashRoute();
  const auth = useAuth();
  const [language, setLanguage] = useState<AppLanguage | null>(readSavedLanguage);
  const [isChoosingLanguage, setIsChoosingLanguage] = useState(language === null);
  const activeLanguage = language ?? 'ar';
  const copy = translations[activeLanguage];
  const languageDetails = getLanguage(activeLanguage);

  useEffect(() => {
    document.documentElement.lang = activeLanguage;
    document.documentElement.dir = languageDetails.dir;
    const section = route.area === 'admin' || route.area === 'admin-login' ? 'Admin' : copy.assistant;
    document.title = activeLanguage === 'ar'
      ? `دليل | ${route.area === 'admin' || route.area === 'admin-login' ? 'لوحة الإدارة' : 'المساعد التعليمي الإسلامي'}`
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

  return (
    <PwaStatusProvider language={activeLanguage}>
      {route.area === 'password' ? (
        <PasswordAccessPage
          language={activeLanguage}
          languageDetails={languageDetails}
          mode={route.page === 'password-setup' ? 'invitation' : 'recovery'}
          onChooseLanguage={() => setIsChoosingLanguage(true)}
          token={route.token}
        />
      ) : route.area !== 'public' ? (
        <AdminGate
          language={activeLanguage}
          languageDetails={languageDetails}
          loginRoute={route.area === 'admin-login'}
          onChooseLanguage={() => setIsChoosingLanguage(true)}
          page={route.area === 'admin-login' ? route.returnTo : route.page}
        />
      ) : (
        <main className="page-shell" dir={languageDetails.dir}>
          <header className="site-header">
            <a className="brand" href="#/chat" aria-label={copy.brandAria}>
              <span className="brand-mark"><BookOpen size={22} /></span>
              <span>{activeLanguage === 'ar' ? 'دليل' : 'Daleel'}</span>
            </a>
            <nav className="site-nav" aria-label={copy.assistant}>
              <a aria-current="page" href="#/chat">{copy.assistant}</a>
              {auth.state.status === 'authenticated' && <a href="#/admin/dashboard">{copy.adminPanel}</a>}
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
      )}
    </PwaStatusProvider>
  );
}

function readSavedLanguage(): AppLanguage | null {
  const saved = localStorage.getItem('daleel-language');
  return isAppLanguage(saved) ? saved : null;
}
