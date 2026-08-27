import { KbPageListItem } from './KbPageListItem';
import { KbTagFilter } from './KbTagFilter';
import { formatDate } from './formatDate';
import type { KnowledgeBaseState } from './useKnowledgeBase';

type KbSidebarState = Pick<
  KnowledgeBaseState,
  | 'sortedPages'
  | 'selectedId'
  | 'searchQuery'
  | 'setSearchQuery'
  | 'addPage'
  | 'selectPage'
  | 'allPages'
  | 'activeTag'
  | 'setActiveTag'
>;

function SidebarHeader({ count }: { count: number }) {
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
      <div
        style={{
          fontSize: 10,
          color: '#64748b',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        📚 Dokumentace
      </div>
      <span style={{ fontSize: 9, color: '#475569' }}>{count} stránek</span>
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e253366' }}>
      <input
        className="inp"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Hledat..."
        style={{ width: '100%', fontSize: 11 }}
      />
    </div>
  );
}

export function KbSidebar({ kb }: { kb: KbSidebarState }) {
  const {
    sortedPages,
    selectedId,
    searchQuery,
    setSearchQuery,
    addPage,
    selectPage,
    allPages,
    activeTag,
    setActiveTag,
  } = kb;

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        border: '1px solid #1e2533',
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <SidebarHeader count={sortedPages.length} />
      <SearchBox value={searchQuery} onChange={setSearchQuery} />

      <KbTagFilter pages={allPages} activeTag={activeTag} onSelect={setActiveTag} />

      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e253366' }}>
        <button
          type="button"
          className="btn"
          onClick={addPage}
          style={{
            width: '100%',
            padding: '6px 12px',
            background: '#0d2210',
            borderColor: '#34d39944',
            color: '#6ee7b7',
            fontSize: 10,
          }}
        >
          + Nová stránka
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sortedPages.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', padding: 20 }}>
            {searchQuery ? 'Žádné výsledky' : 'Zatím žádné stránky'}
          </div>
        ) : (
          sortedPages.map((page) => (
            <KbPageListItem
              key={page.id}
              page={page}
              isSelected={selectedId === page.id}
              searchQuery={searchQuery}
              formattedDate={formatDate(page.updatedAt)}
              onClick={() => selectPage(page.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
