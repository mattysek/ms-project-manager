import { KbContentBody } from './KbContentBody';
import { KbContentHeader } from './KbContentHeader';
import { KbHistoryDialog } from './KbHistoryDialog';
import type { KnowledgeBaseState } from './useKnowledgeBase';

function EmptyState() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#475569',
        fontSize: 12,
      }}
    >
      Vyberte stránku nebo vytvořte novou
    </div>
  );
}

export function KbContentArea({ kb, projectId }: { kb: KnowledgeBaseState; projectId: string }) {
  return (
    <div
      style={{
        flex: 1,
        border: '1px solid #1e2533',
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {kb.selectedPage ? (
        <>
          <KbContentHeader page={kb.selectedPage} kb={kb} />
          <KbContentBody kb={kb} />
          {kb.historyOpen && (
            <KbHistoryDialog
              projectId={projectId}
              pageId={kb.selectedPage.id}
              onRestore={kb.restoreRevision}
              onClose={kb.closeHistory}
            />
          )}
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
