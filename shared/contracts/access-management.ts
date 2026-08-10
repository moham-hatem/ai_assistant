import type { AuthRole } from './auth.ts';

export interface AccessUserSummary {
  createdAt: string;
  displayName: string;
  email: string;
  enabled: boolean;
  id: string;
  roles: AuthRole[];
  updatedAt: string;
}

export interface AccessUserPage {
  items: AccessUserSummary[];
  nextCursor: string | null;
}

export interface AccessUserDetails extends AccessUserSummary {}

export interface AccessInvitationSummary {
  createdAt: string;
  displayName: string;
  email: string;
  expiresAt: string;
  id: string;
  roles: AuthRole[];
  status: 'active';
}

export interface AccessInvitationPage {
  items: AccessInvitationSummary[];
  nextCursor: string | null;
}

export interface CreateInvitationRequest {
  displayName: string;
  email: string;
  roles: AuthRole[];
}

export interface UpdateAccessUserRequest {
  displayName?: string;
  roles?: AuthRole[];
}

export interface SecretLinkResponse {
  expiresAt: string;
  id: string;
  link: string;
  warning: 'This link is a secret and will not be shown again.';
}

export interface RedeemPasswordTokenRequest {
  password: string;
  token: string;
}
