import { Bot, Languages, LockKeyhole } from 'lucide-react';
import type { LanguageOption } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { adminRoute } from '../../../app/routes';

interface AdminSettingsPageProps {
  copy: AdminCopy;
  languageDetails: LanguageOption;
}

export function AdminSettingsPage({ copy, languageDetails }: AdminSettingsPageProps) {
  return (
    <>
      <AdminPageHeader description={copy.pageIntro.settings} eyebrow={copy.navigation.settings} title={copy.pageTitle.settings} />
      <section className="settings-grid">
        <article className="settings-card">
          <Languages size={22} />
          <div><h2>{copy.currentLanguage}</h2><p>{languageDetails.nativeLabel}</p></div>
          <span className="status-badge status-ready">{copy.ready}</span>
        </article>
        <article className="settings-card">
          <LockKeyhole size={22} />
          <div><h2>{copy.settingsAccessTitle}</h2><p>{copy.settingsAccessBody}</p></div>
          <a className="status-badge status-ready" href={adminRoute('access')}>{copy.ready}</a>
        </article>
        <article className="settings-card">
          <Bot size={22} />
          <div><h2>{copy.settingsAnswerTitle}</h2><p>{copy.settingsAnswerBody}</p></div>
          <span className="status-badge status-ready">{copy.ready}</span>
        </article>
      </section>
    </>
  );
}
