import { Activity, BookOpen, ClipboardCheck, DatabaseBackup, HeartPulse, LayoutDashboard, ListTree, Settings, ShieldCheck, Users } from 'lucide-react';
import { adminRoute, type AdminPage } from '../../../app/routes';
import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { qualityMetricsCopies } from '../quality-metrics/copy';
import type { AuthPrincipal } from '../../../../shared/contracts/auth';
import { canOpenAdminPage } from '../../auth/permissions';
import { securityAuditCopies } from '../security-audit/copy';
import { backupsCopies } from '../backups/copy';
import { systemDiagnosticsCopies } from '../system-diagnostics/copy';

interface AdminNavigationProps {
  activePage: AdminPage;
  copy: AdminCopy;
  language: AppLanguage;
  navigationBlocked: boolean;
  principal: AuthPrincipal;
}

const items = [
  { page: 'dashboard', label: 'dashboard', Icon: LayoutDashboard },
  { page: 'books', label: 'books', Icon: BookOpen },
  { page: 'reviews', label: 'reviews', Icon: ClipboardCheck },
  { page: 'question-logs', label: 'questionLogs', Icon: ListTree },
  { page: 'quality', label: null, Icon: Activity },
  { page: 'security-audit', label: null, Icon: ShieldCheck },
  { page: 'backups', label: null, Icon: DatabaseBackup },
  { page: 'system-diagnostics', label: null, Icon: HeartPulse },
  { page: 'access', label: 'access', Icon: Users },
  { page: 'settings', label: 'settings', Icon: Settings },
] as const;

type NavigationItem = (typeof items)[number];

function navigationLabel(
  page: NavigationItem['page'],
  label: NavigationItem['label'],
  copy: AdminCopy,
  language: AppLanguage,
): string {
  if (label) return copy.navigation[label];

  switch (page) {
    case 'quality': return qualityMetricsCopies[language].title;
    case 'security-audit': return securityAuditCopies[language].title;
    case 'backups': return backupsCopies[language].title;
    case 'system-diagnostics': return systemDiagnosticsCopies[language].title;
    default: return '';
  }
}

export function AdminNavigation({ activePage, copy, language, navigationBlocked, principal }: AdminNavigationProps) {
  return (
    <nav className="admin-navigation" aria-label={copy.adminLabel}>
      {items.filter(({ page }) => canOpenAdminPage(principal, page)).map(({ Icon, label, page }) => (
        <a
          aria-current={activePage === page ? 'page' : undefined}
          aria-disabled={navigationBlocked || undefined}
          className={page === 'access' ? 'admin-navigation-access' : undefined}
          href={adminRoute(page)}
          key={page}
          onClick={(event) => { if (navigationBlocked) event.preventDefault(); }}
          tabIndex={navigationBlocked ? -1 : undefined}
        >
          <Icon aria-hidden="true" size={19} />
          <span>{navigationLabel(page, label, copy, language)}</span>
        </a>
      ))}
    </nav>
  );
}
