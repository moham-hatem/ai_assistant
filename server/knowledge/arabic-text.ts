const ignoredWords = new Set([
  'الي', 'ان', 'في', 'من', 'ما', 'ماذا', 'علي', 'عن', 'هو', 'هي', 'هذا', 'هذه',
  'ذلك', 'تلك', 'هل', 'كيف', 'كم', 'متي', 'ثم', 'او', 'يا',
]);

export function normalizeArabic(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenize(value: string): string[] {
  return normalizeArabic(value)
    .split(' ')
    .filter((token) => token.length > 1 && !ignoredWords.has(token));
}
