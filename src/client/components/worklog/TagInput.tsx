// Zadávání tagů s našeptáváním z historie (FR-WL-05).
//
// Našeptávač tu není pro pohodlí, ale proto, aby nevznikly „pohotovost"
// i „Pohotovost" jako dva různé štítky — rozpad podle tagů by pak byl
// k ničemu. Server sice duplicity v jednom záznamu slučuje bez ohledu na
// velikost písmen, ale napříč záznamy je rozlišit musí: nemá jak poznat,
// který zápis je ten správný.
import { useId, useState } from 'react';

interface TagInputProps {
  tags: string[];
  /** Tagy z předchozích záznamů; nabízí se ty, co ještě nejsou přidané. */
  suggestions: string[];
  onChange: (tags: string[]) => void;
}

const CHIP_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: '#0d1a2a',
  border: '1px solid #2d3748',
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 10,
  color: '#bfdbfe',
};

function matching(suggestions: string[], tags: string[], draft: string): string[] {
  const needle = draft.trim().toLowerCase();
  if (!needle) return [];
  const used = new Set(tags.map((tag) => tag.toLowerCase()));
  return suggestions
    .filter((tag) => tag.toLowerCase().includes(needle) && !used.has(tag.toLowerCase()))
    .slice(0, 6);
}

export function TagInput({ tags, suggestions, onChange }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const offered = matching(suggestions, tags, draft);

  const add = (tag: string) => {
    const value = tag.trim();
    if (!value) return;
    if (!tags.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      onChange([...tags, value]);
    }
    setDraft('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label className="auth-label" htmlFor={inputId}>
        Tagy
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0' }}>
        {tags.map((tag) => (
          <span key={tag} style={CHIP_STYLE}>
            {tag}
            <button
              type="button"
              aria-label={`Odebrat tag ${tag}`}
              onClick={() => onChange(tags.filter((value) => value !== tag))}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        id={inputId}
        className="inp"
        value={draft}
        placeholder="Napiš tag a stiskni Enter"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Enter uvnitř formuláře by jinak odeslal celý záznam.
          if (event.key === 'Enter') {
            event.preventDefault();
            add(draft);
          }
        }}
      />
      {offered.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {offered.map((tag) => (
            <button
              key={tag}
              type="button"
              className="btn btn-accent"
              onClick={() => add(tag)}
              style={{ fontSize: 10, padding: '2px 8px' }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
