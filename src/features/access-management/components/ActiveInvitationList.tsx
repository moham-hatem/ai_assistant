import { forwardRef } from 'react';
import type { ActiveInvitation, ActiveInvitationPage } from '../active-invitation';
import type { AccessCopy } from '../access-copy';
import type { LoadStatus } from '../access-state';

interface ActiveInvitationListProps {
  cancelingId: string | null;
  copy: AccessCopy;
  error: string | null;
  onCancel: (invitation: ActiveInvitation) => void;
  onNext: () => void;
  onPrevious: () => void;
  onRetry: () => void;
  page: ActiveInvitationPage | null;
  status: LoadStatus;
  canGoBack: boolean;
}

export const ActiveInvitationList = forwardRef<HTMLElement, ActiveInvitationListProps>(
  function ActiveInvitationList(props, ref) {
    const busy = props.cancelingId !== null || props.status === 'loading';
    return (
      <section aria-labelledby="active-invitations-title" className="access-invitations" ref={ref} tabIndex={-1}>
        <div className="access-invitations-heading">
          <div>
            <h2 id="active-invitations-title">{props.copy.activeInvitations.title}</h2>
            <p>{props.copy.activeInvitations.body}</p>
          </div>
        </div>
        <div className="access-recovery-guidance">{props.copy.activeInvitations.recoveryHelp}</div>
        {props.status === 'loading' && <div className="access-invitation-state" role="status">{props.copy.loading}</div>}
        {props.status === 'error' && <div className="access-invitation-state" role="alert"><p>{props.copy.activeInvitations.error}</p><button className="access-secondary" onClick={props.onRetry} type="button">{props.copy.actions.retry}</button></div>}
        {props.status === 'empty' && <div className="access-invitation-state"><p>{props.copy.activeInvitations.empty}</p>{props.canGoBack && <button className="access-secondary" onClick={props.onPrevious} type="button">{props.copy.previous}</button>}</div>}
        {props.status === 'ready' && <div className="access-invitation-grid">
          {props.page?.items.map((invitation) => (
            <article className="access-invitation-card" key={invitation.id}>
              <div><h3>{invitation.displayName}</h3><p dir="ltr">{invitation.email}</p></div>
              <span className="access-status is-enabled">{props.copy.activeInvitations.active}</span>
              <dl>
                <div><dt>{props.copy.rolesHeading}</dt><dd>{invitation.roles.map((role) => props.copy.roles[role].label).join(', ')}</dd></div>
                <div><dt>{props.copy.created}</dt><dd><time dateTime={invitation.createdAt}>{new Date(invitation.createdAt).toLocaleString()}</time></dd></div>
                <div><dt>{props.copy.expires}</dt><dd><time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleString()}</time></dd></div>
              </dl>
              <button className="access-danger-outline" disabled={busy} onClick={() => props.onCancel(invitation)} type="button">{props.copy.activeInvitations.cancel}</button>
            </article>
          ))}
          {props.error && <p className="access-inline-error" role="alert">{props.copy.activeInvitations.cancelError}</p>}
          <div className="access-pagination">
            <button disabled={busy || !props.canGoBack} onClick={props.onPrevious} type="button">{props.copy.previous}</button>
            <button disabled={busy || !props.page?.nextCursor} onClick={props.onNext} type="button">{props.copy.next}</button>
          </div>
        </div>}
      </section>
    );
  },
);
