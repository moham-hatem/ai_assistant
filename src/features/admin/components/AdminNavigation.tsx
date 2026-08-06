import { BookOpen, ClipboardCheck, LayoutDashboard, ListTree, Settings } from 'lucide-react';
import { adminRoute, type AdminPage } from '../../../app/routes';
import type { AdminCopy } from '../adminCopy';

interface AdminNavigationProps {
  activePage: AdminPage;
  copy: AdminCopy;
}

const items = [
  { page: 'dashboard', label: 'dashboard', Icon: LayoutDashboard },
  { page: 'books', label: 'books', Icon: BookOpen },
  { page: 'reviews', label: 'reviews', Icon: ClipboardCheck },
  { page: 'question-logs', label: 'questionLogs', Icon: ListTree },
  { page: 'settings', label: 'settings', Icon: Settings },
] as const;

export function AdminNavigation({ activePage, copy }: AdminNavigationProps) {
  return (
    <nav className="admin-navigation" aria-label={copy.adminLabel}>
      {items.map(({ Icon, label, page }) => (
        <a
          aria-current={activePage === page ? 'page' : undefined}
          href={adminRoute(page)}
          key={page}
        >
          <Icon aria-hidden="true" size={19} />
          <span>{copy.navigation[label]}</span>
        </a>
      ))}
    </nav>
  );
}
