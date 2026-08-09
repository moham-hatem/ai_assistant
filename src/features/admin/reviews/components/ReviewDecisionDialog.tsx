import { AlertCircle, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { ReviewsCopy } from '../copy';
import {
  buildDecisionRequest,
  ReviewActionValidationError,
  type ReviewActionValidationCode,
} from '../review-actions';
import type { DecisionMode, ReviewDecisionRequest } from '../types';

interface ReviewDecisionDialogProps {
  copy: ReviewsCopy;
  initialAnswer: string;
  mode: DecisionMode;
  onClose: () => void;
  onConfirm: (request: ReviewDecisionRequest) => void;
  reviewerId: string;
}
export function ReviewDecisionDialog({
  copy,
  initialAnswer,
  mode,
  onClose,
  onConfirm,
  reviewerId,
}: ReviewDecisionDialogProps) {
  const [correctedAnswer, setCorrectedAnswer] = useState(mode === 'approve_edited' ? initialAnswer : '');
  const [internalNotes, setInternalNotes] = useState('');
  const [validation, setValidation] = useState<ReviewActionValidationCode | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const request = buildDecisionRequest({ correctedAnswer, internalNotes, mode, reviewerId });
      onConfirm(request);
      onClose();
    } catch (error) {
      if (error instanceof ReviewActionValidationError) setValidation(error.code);
      else setValidation('request_too_large');
    }
  }

  const needsCorrection = mode === 'approve_edited';
  const needsNotes = mode === 'needs_changes';
  return (
    <div className="review-dialog-backdrop">
      <section aria-labelledby="review-dialog-title" aria-modal="true" className="review-dialog" role="dialog">
        <header>
          <div><small>{copy.confirmDecision}</small><h2 id="review-dialog-title">{copy.decisionTitles[mode]}</h2></div>
          <button className="review-icon-button" onClick={onClose} title={copy.cancel} type="button"><X size={18} /><span className="sr-only">{copy.cancel}</span></button>
        </header>
        <form onSubmit={submit}>
          <p className="review-dialog-description">{copy.decisionDescriptions[mode]}</p>
          {needsCorrection && (
            <label>
              <span>{copy.correctedAnswer}</span>
              <textarea autoFocus dir="auto" maxLength={20_000} onChange={(event) => setCorrectedAnswer(event.target.value)} rows={8} value={correctedAnswer} />
            </label>
          )}
          <label>
            <span>{copy.internalNotes}<small>{needsNotes ? copy.notesRequired : copy.notesOptional}</small></span>
            <textarea autoFocus={!needsCorrection} dir="auto" maxLength={4_000} onChange={(event) => setInternalNotes(event.target.value)} rows={4} value={internalNotes} />
          </label>
          {validation && <p className="review-validation" role="alert"><AlertCircle size={17} />{copy.validation[validation]}</p>}
          <footer>
            <button className="review-secondary-button" onClick={onClose} type="button">{copy.cancel}</button>
            <button className={`review-primary-button review-decision-${mode}`} type="submit">{copy.submitDecision}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
