import { validateReviewerId } from './review-actions';

const storageKey = 'daleel-admin-reviewer-id';

export function readReviewerId(): string {
  try {
    return localStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
}
export function saveReviewerId(value: string): string {
  const reviewerId = value.trim();
  try {
    if (reviewerId) localStorage.setItem(storageKey, reviewerId);
    else localStorage.removeItem(storageKey);
  } catch {
    // The visible session field still works when browser storage is unavailable.
  }
  return reviewerId;
}

export function isUsableReviewerId(value: string): boolean {
  try {
    validateReviewerId(value);
    return true;
  } catch {
    return false;
  }
}
