const followUpQuestion = /\s+و(?=(?:ما|ماذا|من|متى|أين|كيف|هل|لماذا|لِمَ|كم|أي)(?:\s|$))/u;
const englishFollowUp = /\s+and\s+(?=(?:what|how|why|when|where|who|is|are|do|does|can)\s)/i;
const swahiliFollowUp = /\s+na\s+(?=(?:nini|jinsi|kwa nini|lini|wapi|nani|je|maana)\s)/i;
const punctuation = /[؟?!؛;\n]+/u;

export function splitQuestionParts(question: string): string[] {
  const parts = question
    .split(punctuation)
    .flatMap((part) => part.split(followUpQuestion))
    .flatMap((part) => part.split(englishFollowUp))
    .flatMap((part) => part.split(swahiliFollowUp))
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);

  return [...new Set(parts)].slice(0, 3).length > 0
    ? [...new Set(parts)].slice(0, 3)
    : [question.trim()];
}
