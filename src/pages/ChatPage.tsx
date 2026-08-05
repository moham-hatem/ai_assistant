import { MessageCircleMore, Send } from 'lucide-react';
import { ChatPanel } from '../features/chat/containers/ChatPanel';
import type { AppLanguage } from '../i18n/language';
import type { AppTranslations } from '../i18n/translations';

interface ChatPageProps {
  copy: AppTranslations;
  language: AppLanguage;
}

export function ChatPage({ copy, language }: ChatPageProps) {
  return (
    <>
      <section className="hero" aria-labelledby="page-title">
        <span className="eyebrow"><MessageCircleMore size={17} /> {copy.heroEyebrow}</span>
        <h1 id="page-title">{copy.heroTitle}</h1>
        <p>{copy.heroBody}</p>
      </section>
      <ChatPanel copy={copy} language={language} />
      <aside className="disclaimer">
        <Send size={18} />
        <span>{copy.disclaimer}</span>
      </aside>
    </>
  );
}
