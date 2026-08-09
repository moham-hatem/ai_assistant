import type { FeedbackApiErrorCode } from './api/submit-feedback';
import type { FeedbackReason } from './types';

export interface FeedbackCopy {
  cancel: string;
  close: string;
  commentHint: string;
  commentLabel: string;
  commentPlaceholder: string;
  confirmHelpful: string;
  confirmHelpfulAction: string;
  dialogDescription: string;
  dialogTitle: string;
  error: Record<FeedbackApiErrorCode, string>;
  helpful: string;
  prompt: string;
  reasonRequired: string;
  reasons: Record<FeedbackReason, string>;
  retry: string;
  reviewRouted: string;
  reviewNotCreated: string;
  submitReport: string;
  submitting: string;
  success: string;
  unhelpful: string;
}
