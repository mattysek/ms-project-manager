import type { KBPage } from '../../types';
import { KbContentArea } from './kb/KbContentArea';
import { KbSidebar } from './kb/KbSidebar';
import { MARKDOWN_STYLES } from './kb/markdownStyles';
import { useKnowledgeBase } from './kb/useKnowledgeBase';

interface KnowledgeBaseViewProps {
  kbPages: KBPage[];
  setKbPages: React.Dispatch<React.SetStateAction<KBPage[]>>;
  /** Historie stránek se čte přes REST per projekt (knowledge-base.feature). */
  projectId: string;
}

export function KnowledgeBaseView({ kbPages, setKbPages, projectId }: KnowledgeBaseViewProps) {
  const kb = useKnowledgeBase({ kbPages, setKbPages });

  return (
    <div style={{ padding: '20px 28px', height: 'calc(100vh - 120px)', display: 'flex', gap: 20 }}>
      <KbSidebar kb={kb} />
      <KbContentArea kb={kb} projectId={projectId} />
      <style>{MARKDOWN_STYLES}</style>
    </div>
  );
}
