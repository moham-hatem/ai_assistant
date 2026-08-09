export const minimumDocumentTextLength = 20;

export function hasSufficientDocumentText(text: string): boolean {
  return text.trim().length >= minimumDocumentTextLength;
}
