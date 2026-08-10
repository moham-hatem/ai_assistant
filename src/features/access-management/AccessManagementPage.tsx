import { useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { AppLanguage } from '../../i18n/language';
import { AdminPageHeader } from '../admin/components/AdminPageHeader';
import { accessCopies } from './access-copy';
import { AccessUserDetails } from './components/AccessUserDetails';
import { AccessUserList } from './components/AccessUserList';
import { ConfirmActionDialog } from './components/ConfirmActionDialog';
import { InvitationDialog } from './components/InvitationDialog';
import { SecretLinkDialog } from './components/SecretLinkDialog';
import { useAccessManagement } from './hooks/useAccessManagement';
import { ActiveInvitationList } from './components/ActiveInvitationList';
import { CancelInvitationDialog } from './components/CancelInvitationDialog';
import type { ActiveInvitation } from './active-invitation';
import { useActiveInvitations } from './hooks/useActiveInvitations';
import { revealActiveInvitations } from './invitation-recovery';

export function AccessManagementPage({ language }: { language: AppLanguage }) {
  const copy = accessCopies[language];
  const access = useAccessManagement();
  const activeInvitations = useActiveInvitations();
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<'enable' | 'disable' | 'sessions' | null>(null);
  const [cancelInvitation, setCancelInvitation] = useState<ActiveInvitation | null>(null);
  const activeInvitationsRef = useRef<HTMLElement | null>(null);
  const secretTrigger = useRef<HTMLButtonElement | null>(null);

  function closeInvitation() {
    setInvitationOpen(false);
  }

  function navigateList(direction: 'next' | 'previous' | 'retry') {
    setConfirmation(null);
    if (direction === 'next') access.nextPage();
    else if (direction === 'previous') access.previousPage();
    else access.retryList();
  }

  function closeSecret() {
    access.clearSecret();
    queueMicrotask(() => secretTrigger.current?.isConnected && secretTrigger.current.focus());
  }

  async function invite(input: Parameters<typeof access.invite>[0]) {
    const created = await access.invite(input);
    if (created) activeInvitations.reload();
    return created;
  }

  async function confirmInvitationCancellation() {
    if (!cancelInvitation) return;
    if (await activeInvitations.cancel(cancelInvitation.id)) setCancelInvitation(null);
  }

  function confirmAction() {
    const id = access.state.selectedId;
    if (!id || !confirmation) return;
    const action = confirmation;
    setConfirmation(null);
    if (action === 'sessions') void access.revokeSessions(id);
    else void access.setEnabled(id, action === 'enable');
  }

  return (
    <>
      <div className="access-page-heading">
        <AdminPageHeader description={copy.intro} eyebrow={copy.title} title={copy.title} />
        <button className="access-primary" disabled={access.busyAction !== null || access.state.listStatus === 'loading'} onClick={(event) => { secretTrigger.current = event.currentTarget; setInvitationOpen(true); }} type="button"><UserPlus size={18} />{copy.invitation.open}</button>
      </div>
      <section className="access-workspace" aria-label={copy.title}>
        <div className="access-list-panel">
          <AccessUserList
            canGoBack={access.state.cursorHistory.length > 0}
            copy={copy}
            disabled={access.busyAction !== null || access.state.listStatus === 'loading'}
            onNext={() => navigateList('next')}
            onPrevious={() => navigateList('previous')}
            onRetry={() => navigateList('retry')}
            onSelect={access.selectUser}
            page={access.state.page}
            selectedId={access.state.selectedId}
            status={access.state.listStatus}
          />
        </div>
        <div className="access-detail-panel">
          <AccessUserDetails
            actionError={access.actionError}
            actionSuccess={access.actionSuccess}
            busy={access.busyAction}
            copy={copy}
            onConfirm={setConfirmation}
            onRecovery={(id, trigger) => { secretTrigger.current = trigger; void access.createRecovery(id); }}
            onRetry={access.selectUser}
            onSave={(id, update) => void access.saveUser(id, update)}
            selectedId={access.state.selectedId}
            status={access.state.detailStatus}
            user={access.state.detail}
          />
        </div>
      </section>
      <ActiveInvitationList
        canGoBack={activeInvitations.state.cursorHistory.length > 0}
        cancelingId={activeInvitations.state.cancelingId}
        copy={copy}
        error={activeInvitations.state.actionError}
        onCancel={setCancelInvitation}
        onNext={activeInvitations.nextPage}
        onPrevious={activeInvitations.previousPage}
        onRetry={activeInvitations.reload}
        page={activeInvitations.state.page}
        ref={activeInvitationsRef}
        status={activeInvitations.state.status}
      />
      {invitationOpen && <InvitationDialog copy={copy} error={access.invitationError} inviting={access.inviting} onClose={closeInvitation} onInvite={invite} onReviewActiveInvitations={() => revealActiveInvitations(closeInvitation, activeInvitationsRef.current)} />}
      {confirmation && <ConfirmActionDialog action={confirmation} busy={access.busyAction} copy={copy} onClose={() => setConfirmation(null)} onConfirm={confirmAction} />}
      {cancelInvitation && <CancelInvitationDialog busy={activeInvitations.state.cancelingId !== null} copy={copy} invitation={cancelInvitation} onClose={() => { if (!activeInvitations.state.cancelingId) setCancelInvitation(null); }} onConfirm={() => void confirmInvitationCancellation()} />}
      {access.secret && <SecretLinkDialog copy={copy} kind={access.secret.kind} onClose={closeSecret} secret={access.secret.value} />}
    </>
  );
}
