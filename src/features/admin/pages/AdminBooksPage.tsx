import { KnowledgeManager } from '../../knowledge/containers/KnowledgeManager';
import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';

interface AdminBooksPageProps { copy: AdminCopy }

export function AdminBooksPage({ copy }: AdminBooksPageProps) {
  return (
    <>
      <AdminPageHeader
        description={copy.pageIntro.books}
        eyebrow={copy.navigation.books}
        title={copy.pageTitle.books}
      />
      <KnowledgeManager />
    </>
  );
}
