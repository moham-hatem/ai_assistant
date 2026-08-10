import { Activity, BookOpen, ClipboardCheck, LayoutDashboard, ListTree, Settings, Users } from 'lucide-react';
import { adminRoute, type AdminPage } from '../../../app/routes';
import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { qualityMetricsCopies } from '../quality-metrics/copy';
import type { AuthPrincipal } from '../../../../shared/contracts/auth';
import { canOpenAdminPage } from '../../auth/permissions';

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
  { page: 'access', label: 'access', Icon: Users },
  { page: 'settings', label: 'settings', Icon: Settings },
] as const;

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
          <span>{label ? copy.navigation[label] : qualityMetricsCopies[language].title}</span>
        </a>
      ))}
    </nav>
  );
}
