import { FormEvent, useState } from 'react';
import { ArrowUp } from 'lucide-react';

interface ChatComposerProps {
  disabled: boolean;
  errorMessage: string | null;
  labels: { placeholder: string; question: string; send: string };
  onSubmit: (question: string) => void;
}

export function ChatComposer({ disabled, errorMessage, labels, onSubmit }: ChatComposerProps) {
  const [question, setQuestion] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || disabled) return;

    onSubmit(trimmedQuestion);
    setQuestion('');
  }

  return (
    <div className="composer-shell">
      {errorMessage && <p className="composer-error" role="alert">{errorMessage}</p>}
      <form className="composer" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="question">{labels.question}</label>
        <textarea
          id="question"
          value={question}
          disabled={disabled}
          maxLength={1000}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={labels.placeholder}
          rows={2}
        />
        <button type="submit" disabled={disabled || !question.trim()} aria-label={labels.send}>
          <ArrowUp size={20} />
        </button>
      </form>
    </div>
  );
}
