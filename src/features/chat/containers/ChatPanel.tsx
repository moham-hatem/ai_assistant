import { ChatComposer } from '../components/ChatComposer';
import { ChatTranscript } from '../components/ChatTranscript';
import { useLearningChat } from '../hooks/useLearningChat';
import type { AppLanguage } from '../../../i18n/language';
import type { AppTranslations } from '../../../i18n/translations';

interface ChatPanelProps {
  copy: AppTranslations;
  language: AppLanguage;
}

export function ChatPanel({ copy, language }: ChatPanelProps) {
  const { errorMessage, messages, sendQuestion, status } = useLearningChat(language, copy);

  return (
    <section className="chat-card" aria-label={copy.chatAria}>
      <ChatTranscript
        copy={copy}
        isAnswering={status === 'answering'}
        messages={messages}
        searchingLabel={copy.searching}
      />
      <ChatComposer
        disabled={status === 'answering'}
        errorMessage={errorMessage}
        labels={{ placeholder: copy.placeholder, question: copy.questionLabel, send: copy.send }}
        onSubmit={sendQuestion}
      />
    </section>
  );
}
