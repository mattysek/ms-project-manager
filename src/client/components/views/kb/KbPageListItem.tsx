// Jedna položka seznamu KB stránek v levém panelu — název, datum úpravy a při
// aktivním hledání zvýrazněný výřez okolo shody (Scenario: Fulltext
// vyhledávání v KB — knowledge-base.feature).
import { HighlightedSnippet } from './HighlightedSnippet';
import { findSnippet } from './kbSearch';
import type { KBPage } from '../../../types';

interface KbPageListItemProps {
  page: KBPage;
  isSelected: boolean;
  searchQuery: string;
  formattedDate: string;
  onClick: () => void;
}

export function KbPageListItem({
  page,
  isSelected,
  searchQuery,
  formattedDate,
  onClick,
}: KbPageListItemProps) {
  const snippet = searchQuery.trim()
    ? findSnippet(`${page.title}\n${page.content}`, searchQuery)
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        border: 'none',
        borderBottom: '1px solid #1e253344',
        font: 'inherit',
        padding: '10px 14px',
        cursor: 'pointer',
        background: isSelected ? '#1a2535' : 'transparent',
        borderLeft: isSelected ? '3px solid #4f9cf9' : '3px solid transparent',
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: isSelected ? '#e2e8f0' : '#94a3b8',
          fontWeight: isSelected ? 600 : 400,
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {page.title}
      </div>
      <div style={{ fontSize: 9, color: '#475569' }}>{formattedDate}</div>
      {snippet && <HighlightedSnippet snippet={snippet} />}
    </button>
  );
}
