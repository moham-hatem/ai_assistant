import { Activity, BookOpen, ClipboardCheck, LayoutDashboard, ListTree, Settings } from 'lucide-react';
import { adminRoute, type AdminPage } from '../../../app/routes';
import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { qualityMetricsCopies } from '../quality-metrics/copy';

interface AdminNavigationProps {
  activePage: AdminPage;
  copy: AdminCopy;
  language: AppLanguage;
}

const items = [
  { page: 'dashboard', label: 'dashboard', Icon: LayoutDashboard },
  { page: 'books', label: 'books', Icon: BookOpen },
  { page: 'reviews', label: 'reviews', Icon: ClipboardCheck },
  { page: 'question-logs', label: 'questionLogs', Icon: ListTree },
  { page: 'quality', label: null, Icon: Activity },
  { page: 'settings', label: 'settings', Icon: Settings },
] as const;

export function AdminNavigation({ activePage, copy, language }: AdminNavigationProps) {
  return (
    <nav className="admin-navigation" aria-label={copy.adminLabel}>
      {items.map(({ Icon, label, page }) => (
        <a
          aria-current={activePage === page ? 'page' : undefined}
          href={adminRoute(page)}
          key={page}
        >
          <Icon aria-hidden="true" size={19} />
          <span>{label ? copy.navigation[label] : qualityMetricsCopies[language].title}</span>
        </a>
      ))}
    </nav>
  );
}
