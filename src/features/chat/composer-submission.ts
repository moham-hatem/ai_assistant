export interface ComposerSubmission {
  nextDraft: string;
  question: string | null;
}

export function prepareComposerSubmission(draft: string, isBlocked: boolean): ComposerSubmission {
  const question = draft.trim();
  if (isBlocked || !question) return { nextDraft: draft, question: null };
  return { nextDraft: '', question };
}
