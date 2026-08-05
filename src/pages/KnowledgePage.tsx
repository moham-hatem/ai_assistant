import { LibraryBig } from 'lucide-react';
import { KnowledgeManager } from '../features/knowledge/containers/KnowledgeManager';

export function KnowledgePage() {
  return (
    <>
      <section className="hero hero-compact" aria-labelledby="knowledge-title">
        <span className="eyebrow"><LibraryBig size={17} /> قاعدة المعرفة المحلية</span>
        <h1 id="knowledge-title">إدارة الكتب المعتمدة</h1>
        <p>تُحفظ الملفات على جهازك، ويُستخدم النص المستخرج منها فقط في البحث والإجابة.</p>
      </section>
      <KnowledgeManager />
    </>
  );
}
