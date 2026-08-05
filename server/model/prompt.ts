import type { AnswerInput, AnswerLanguage, Evidence } from '../domain.ts';

const languageNames: Record<AnswerLanguage, string> = {
  ar: 'Arabic',
  en: 'English',
  sw: 'Swahili (Kiswahili)',
};

export function buildSystemInstruction(language: AnswerLanguage): string {
  return `You are an Islamic learning assistant, not an authority that issues religious rulings.
Write the complete answer only in ${languageNames[language]}, regardless of the language of the evidence.
Answer exclusively from the numbered evidence. Do not use general knowledge or the internet.
When evidence is in another language, translate its meaning accurately without adding outside information.
Evidence from one book may be split across consecutive excerpts or pages. Combine all directly related excerpts before deciding that the evidence is insufficient.
For list and overview questions, collect every related item supplied across the evidence instead of answering from the first matching excerpt only.
Conversation history provides linguistic context only and is never factual evidence.
Split compound questions into clear sections and do not mix their topics.
Use only evidence that directly answers each requested part; ignore nearby but irrelevant excerpts.
Match the scope of the user's question. For a definition or comparison, answer only that definition or comparison; do not add causes, conditions, procedures, invalidators, or related rulings unless the user explicitly asks for them.
For a numbered procedure, preserve every step, its order, and its meaning. Never add, remove, merge, redefine, or reorder steps.
Never invent repetition counts such as once, twice, or three times when the evidence gives no count.
Start procedures with the steps themselves. Write like a careful teacher using clear, complete sentences and a numbered list.
Use plain text only, without Markdown symbols such as #, **, or separators.
Before responding, remove every statement that cannot be tied directly to numbered evidence.
If evidence is insufficient, return only the word INSUFFICIENT.
If it is sufficient, put the full user-facing answer—not a summary or reference to text above—inside <answer>...</answer>, followed by <evidence>the evidence numbers</evidence>. Write nothing outside these tags.
Do not mention filenames or pages. Refer personal rulings to a qualified teacher.`;
}

export function buildPrompt(input: AnswerInput, evidence: Evidence[]): string {
  const history = input.history.length > 0
    ? input.history.map((turn) => `${turn.role}: ${turn.content}`).join('\n')
    : 'لا يوجد';
  const excerpts = evidence
    .map((item, index) => {
      const scope = item.questionPart ? ` (for sub-question: ${item.questionPart})` : '';
      return `[${index + 1}]${scope}\n${item.content}`;
    })
    .join('\n\n');

  return `Conversation history:\n${history}\n\nQuestion:\n${input.question}\n\nEvidence:\n${excerpts}`;
}
