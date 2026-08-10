import type { AuthRole } from '../../../shared/contracts/auth';

export interface ActiveInvitation {
  createdAt: string;
  displayName: string;
  email: string;
  expiresAt: string;
  id: string;
  roles: AuthRole[];
  status: 'active';
}

export interface ActiveInvitationPage {
  items: ActiveInvitation[];
  nextCursor: string | null;
}
