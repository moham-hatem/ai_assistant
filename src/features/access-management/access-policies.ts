import type {
  AccessUserDetails,
  SecretLinkResponse,
} from '../../../shared/contracts/access-management.ts';
import type { AccessAction } from './hooks/useAccessManagement.ts';

export interface ResolvedAccessAction {
  secret: SecretLinkResponse | null;
  success: AccessAction | null;
  user: AccessUserDetails | null;
}

export interface InvitationUiPolicy {
  ariaBusy: boolean;
  controlsDisabled: boolean;
  dismissible: boolean;
}

export function invitationUiPolicy(inviting: boolean): InvitationUiPolicy {
  return {
    ariaBusy: inviting,
    controlsDisabled: inviting,
    dismissible: !inviting,
  };
}

export function canDismissInvitation(inviting: boolean): boolean {
  return invitationUiPolicy(inviting).dismissible;
}

export function resolveAccessAction(
  action: AccessAction,
  result: AccessUserDetails | SecretLinkResponse | void,
  currentSelection: boolean,
): ResolvedAccessAction {
  if (isSecretLink(result)) {
    return { secret: result, success: currentSelection ? action : null, user: null };
  }
  if (!currentSelection) return { secret: null, success: null, user: null };
  return {
    secret: null,
    success: action,
    user: (result ?? null) as AccessUserDetails | null,
  };
}

function isSecretLink(
  result: AccessUserDetails | SecretLinkResponse | void,
): result is SecretLinkResponse {
  return Boolean(result && 'link' in result);
}
