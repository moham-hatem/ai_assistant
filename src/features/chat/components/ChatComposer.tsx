import { FormEvent, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { prepareComposerSubmission } from '../composer-submission';

interface ChatComposerProps {
  errorMessage: string | null;
  labels: { placeholder: string; question: string; send: string };
  onSubmit: (question: string) => void;
  submissionBlockReason: string | null;
}

export function ChatComposer({ errorMessage, labels, onSubmit, submissionBlockReason }: ChatComposerProps) {
  const [question, setQuestion] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submission = prepareComposerSubmission(question, submissionBlockReason !== null);
    if (!submission.question) return;

    onSubmit(submission.question);
    setQuestion(submission.nextDraft);
  }

  return (
    <div className="composer-shell">
      {errorMessage && <p className="composer-error" role="alert">{errorMessage}</p>}
      {submissionBlockReason && <p className="composer-status" id="composer-status" role="status">{submissionBlockReason}</p>}
      <form aria-disabled={submissionBlockReason !== null} className="composer" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="question">{labels.question}</label>
        <textarea
          aria-describedby={submissionBlockReason ? 'composer-status' : undefined}
          id="question"
          value={question}
          maxLength={1000}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={labels.placeholder}
          rows={2}
        />
        <button
          type="submit"
          disabled={submissionBlockReason !== null || !question.trim()}
          aria-label={submissionBlockReason ?? labels.send}
        >
          <ArrowUp size={20} />
        </button>
      </form>
    </div>
  );
}
