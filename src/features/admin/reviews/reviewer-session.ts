import { validateReviewerId } from './review-actions.ts';
import type { AuthPrincipal } from '../../../../shared/contracts/auth.ts';

// The reviewer identifier is deliberately isolated here so a future backend contract
// can replace principal.id without touching review components or action payloads.
export function reviewerIdFromPrincipal(principal: AuthPrincipal): string {
  return principal.id;
}

export function isUsableReviewerId(value: string): boolean {
  try {
    validateReviewerId(value);
    return true;
  } catch {
    return false;
  }
}
