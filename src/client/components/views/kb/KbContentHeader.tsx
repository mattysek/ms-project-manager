import type { KBPage } from '../../../types';
import { formatDate } from './formatDate';
import type { KnowledgeBaseState } from './useKnowledgeBase';

type KbHeaderState = Pick<
  KnowledgeBaseState,
  'isEditing' | 'draft' | 'saveEdit' | 'cancelEdit' | 'startEdit' | 'deletePage' | 'openHistory'
>;

function EditActions({ kb }: { kb: Pick<KbHeaderState, 'saveEdit' | 'cancelEdit'> }) {
  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={kb.saveEdit}
        style={{
          padding: '4px 12px',
          fontSize: 10,
          background: '#0d2210',
          borderColor: '#34d39966',
          color: '#6ee7b7',
        }}
      >
        ✓ Uložit
      </button>
      <button
        type="button"
        className="btn"
        onClick={kb.cancelEdit}
        style={{
          padding: '4px 12px',
          fontSize: 10,
          background: '#161b27',
          borderColor: '#2d3748',
          color: '#94a3b8',
        }}
      >
        Zrušit
      </button>
    </>
  );
}

function ViewActions({
  page,
  kb,
}: {
  page: KBPage;
  kb: Pick<KbHeaderState, 'startEdit' | 'deletePage' | 'openHistory'>;
}) {
  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={kb.openHistory}
        style={{
          padding: '4px 12px',
          fontSize: 10,
          background: '#161b27',
          borderColor: '#2d3748',
          color: '#94a3b8',
        }}
      >
        ⟲ Historie
      </button>
      <button
        type="button"
        className="btn"
        onClick={kb.startEdit}
        style={{
          padding: '4px 12px',
          fontSize: 10,
          background: '#161b27',
          borderColor: '#2d3748',
          color: '#94a3b8',
        }}
      >
        ✎ Upravit
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => kb.deletePage(page.id)}
        style={{
          padding: '4px 10px',
          fontSize: 10,
          background: '#2a1010',
          borderColor: '#f8717144',
          color: '#f87171',
        }}
      >
        ✕
      </button>
    </>
  );
}

/** Štítky stránky pod názvem; bez štítků se nic nevykresluje. */
function PageTags({ tags }: { tags: string[] | undefined }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            padding: '1px 6px',
            fontSize: 8,
            borderRadius: 8,
            background: '#0f1117',
            border: '1px solid #2d3748',
            color: '#64748b',
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function TitleAndTagsEditor({ draft }: { draft: KbHeaderState['draft'] }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        className="inp"
        value={draft.editTitle}
        onChange={(e) => draft.setEditTitle(e.target.value)}
        style={{ fontWeight: 600, fontSize: 13 }}
        placeholder="Název stránky..."
      />
      <input
        className="inp"
        value={draft.editTags}
        onChange={(e) => draft.setEditTags(e.target.value)}
        aria-label="Štítky stránky"
        style={{ fontSize: 10 }}
        placeholder="Štítky oddělené čárkou, např. provoz, docker"
      />
    </div>
  );
}

export function KbContentHeader({ page, kb }: { page: KBPage; kb: KbHeaderState }) {
  const { isEditing, draft } = kb;

  return (
    <div
      style={{
        background: '#161b27',
        padding: '10px 16px',
        borderBottom: '1px solid #1e2533',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {isEditing ? (
        <TitleAndTagsEditor draft={draft} />
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{page.title}</div>
          <PageTags tags={page.tags} />
        </div>
      )}
      <span style={{ fontSize: 9, color: '#475569' }}>Upraveno: {formatDate(page.updatedAt)}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {isEditing ? <EditActions kb={kb} /> : <ViewActions page={page} kb={kb} />}
      </div>
    </div>
  );
}
