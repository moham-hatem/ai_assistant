import type { AuthPrincipal } from '../../../../shared/contracts/auth.ts';

// The UI uses the authenticated identity only to render ownership-aware controls.
// Mutation attribution is derived again from the server-side session.
export function reviewerIdFromPrincipal(principal: AuthPrincipal): string {
  return principal.id;
}

export function isUsableReviewerId(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 200;
}
