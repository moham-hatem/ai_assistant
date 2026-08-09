import { useState } from 'react';
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

export function AccessManagementPage({ language }: { language: AppLanguage }) {
  const copy = accessCopies[language];
  const access = useAccessManagement();
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<'enable' | 'disable' | 'sessions' | null>(null);

  function closeInvitation() {
    access.cancelInvitation();
    setInvitationOpen(false);
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
        <button className="access-primary" onClick={() => setInvitationOpen(true)} type="button"><UserPlus size={18} />{copy.invitation.open}</button>
      </div>
      <section className="access-workspace" aria-label={copy.title}>
        <div className="access-list-panel">
          <AccessUserList
            canGoBack={access.state.cursorHistory.length > 0}
            copy={copy}
            onNext={() => access.dispatch({ type: 'next-page' })}
            onPrevious={() => access.dispatch({ type: 'previous-page' })}
            onRetry={() => access.dispatch({ type: 'retry-list' })}
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
            onRecovery={(id) => void access.createRecovery(id)}
            onRetry={access.selectUser}
            onSave={(id, update) => void access.saveUser(id, update)}
            selectedId={access.state.selectedId}
            status={access.state.detailStatus}
            user={access.state.detail}
          />
        </div>
      </section>
      {invitationOpen && <InvitationDialog copy={copy} error={access.invitationError} inviting={access.inviting} onClose={closeInvitation} onInvite={access.invite} />}
      {confirmation && <ConfirmActionDialog action={confirmation} busy={access.busyAction} copy={copy} onClose={() => setConfirmation(null)} onConfirm={confirmAction} />}
      {access.secret && <SecretLinkDialog copy={copy} kind={access.secret.kind} onClose={access.clearSecret} secret={access.secret.value} />}
    </>
  );
}
