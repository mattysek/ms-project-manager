// Zvýrazněný výřez obsahu ve výsledcích vyhledávání (Scenario: Fulltext
// vyhledávání v KB — knowledge-base.feature: "hledaný výraz je zvýrazněn v
// náhledu stránky"). Renderuje se jako JSX (ne `dangerouslySetInnerHTML`) —
// obsah je prostý text ze `Snippet`, žádné riziko XSS.
import type { Snippet } from './kbSearch';

interface HighlightedSnippetProps {
  snippet: Snippet;
}

export function HighlightedSnippet({ snippet }: HighlightedSnippetProps) {
  return (
    <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>
      {snippet.before}
      <mark style={{ background: '#4f9cf955', color: '#e2e8f0', borderRadius: 2 }}>
        {snippet.match}
      </mark>
      {snippet.after}
    </div>
  );
}
