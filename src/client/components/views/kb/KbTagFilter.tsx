// Filtr stránek podle štítku.
//
// Znalostní báze byla plochý seznam řazený podle data úpravy — nad pár
// desítkami stránek se v tom nedá vyznat. Štítky jsou volnější než strom
// a stránka může být ve víc kategoriích zároveň (knowledge-base.feature).
import type { KBPage } from '../../../types';

interface KbTagFilterProps {
  pages: KBPage[];
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
}

/** Všechny použité štítky, abecedně a bez duplicit. */
export function collectTags(pages: KBPage[]): string[] {
  return [...new Set(pages.flatMap((page) => page.tags ?? []))].sort((a, b) =>
    a.localeCompare(b, 'cs')
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '2px 8px',
    fontSize: 9,
    borderRadius: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
    background: active ? '#1e3a5f' : '#0f1117',
    border: `1px solid ${active ? '#4f9cf988' : '#2d3748'}`,
    color: active ? '#93c5fd' : '#64748b',
  };
}

export function KbTagFilter({ pages, activeTag, onSelect }: KbTagFilterProps) {
  const tags = collectTags(pages);
  if (tags.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: '6px 12px',
        borderBottom: '1px solid #1e253366',
      }}
    >
      <button type="button" onClick={() => onSelect(null)} style={chipStyle(activeTag === null)}>
        Vše
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onSelect(activeTag === tag ? null : tag)}
          style={chipStyle(activeTag === tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
