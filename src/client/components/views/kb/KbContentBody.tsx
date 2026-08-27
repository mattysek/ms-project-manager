import { KbConflictBanner } from './KbConflictBanner';
import { KbEditorPane } from './KbEditorPane';
import type { KnowledgeBaseState } from './useKnowledgeBase';

type KbBodyState = Pick<
  KnowledgeBaseState,
  | 'isEditing'
  | 'conflict'
  | 'restoreFromConflict'
  | 'keepMineOverConflict'
  | 'draft'
  | 'renderedContent'
>;

function EditingFooterHint() {
  return (
    <div
      style={{
        padding: '8px 16px',
        borderTop: '1px solid #1e2533',
        background: '#0c1018',
        fontSize: 10,
        color: '#475569',
      }}
    >
      Podporovaný formát: Markdown (# nadpisy, **tučně**, *kurzíva*, `kód`, ```blok kódu```, -
      seznamy, [odkaz](url))
    </div>
  );
}

export function KbContentBody({ kb }: { kb: KbBodyState }) {
  const { isEditing, conflict, restoreFromConflict, keepMineOverConflict, draft, renderedContent } =
    kb;

  return (
    <>
      {isEditing && conflict && (
        <KbConflictBanner onRestore={restoreFromConflict} onKeepMine={keepMineOverConflict} />
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {isEditing ? (
          <KbEditorPane
            content={draft.editContent}
            onChange={draft.setEditContent}
            tab={draft.editorTab}
            onTabChange={draft.setEditorTab}
          />
        ) : (
          <div
            className="markdown-content"
            style={{
              padding: 20,
              fontSize: 13,
              lineHeight: 1.7,
              color: '#e2e8f0',
              userSelect: 'text',
              cursor: 'text',
            }}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: markdownToHtml je jediné sanitizované místo (CLAUDE.md)
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        )}
      </div>
      {isEditing && <EditingFooterHint />}
    </>
  );
}
