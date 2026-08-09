import type { ReviewStatus } from '../types';
import type { ReviewsCopy } from '../copy';

export function ReviewStatusBadge({ copy, status }: { copy: ReviewsCopy; status: ReviewStatus }) {
  return <span className={`review-badge review-status-${status}`}>{copy.statuses[status]}</span>;
}
export function ReviewChannelBadge({ channel }: { channel: string }) {
  return <span className="review-badge review-channel"><bdi>{channel}</bdi></span>;
}
