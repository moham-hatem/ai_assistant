import { ChatComposer } from '../components/ChatComposer';
import { ChatTranscript } from '../components/ChatTranscript';
import { useLearningChat } from '../hooks/useLearningChat';
import { usePwaStatus } from '../../pwa/PwaStatusProvider';
import type { AppLanguage } from '../../../i18n/language';
import type { AppTranslations } from '../../../i18n/translations';

interface ChatPanelProps {
  copy: AppTranslations;
  language: AppLanguage;
}

export function ChatPanel({ copy, language }: ChatPanelProps) {
  const { errorMessage, messages, sendQuestion, status } = useLearningChat(language, copy);
  const { copy: pwaCopy, isOnline } = usePwaStatus();
  const submissionBlockReason = !isOnline
    ? pwaCopy.composerOffline
    : status === 'answering' ? copy.searching : null;

  return (
    <section className="chat-card" aria-label={copy.chatAria}>
      <ChatTranscript
        copy={copy}
        isAnswering={status === 'answering'}
        messages={messages}
        searchingLabel={copy.searching}
      />
      <ChatComposer
        errorMessage={errorMessage}
        labels={{ placeholder: copy.placeholder, question: copy.questionLabel, send: copy.send }}
        onSubmit={sendQuestion}
        submissionBlockReason={submissionBlockReason}
      />
    </section>
  );
}
