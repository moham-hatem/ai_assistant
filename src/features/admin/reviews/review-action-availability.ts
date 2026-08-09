export function canApproveAsIs(answer: string | null): boolean {
  return typeof answer === 'string' && answer.trim().length > 0;
}
