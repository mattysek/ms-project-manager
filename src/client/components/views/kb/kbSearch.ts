// Čistá funkce pro fulltextové vyhledávání v KB (Scenario: Fulltext vyhledávání
// v KB, Vyhledávání hledá v názvech i obsahu — knowledge-base.feature). Hledá
// case-insensitive v názvu i obsahu a vrací výřez okolo prvního výskytu pro
// zvýraznění v náhledu stránky.
const SNIPPET_RADIUS = 60;

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/** `true`, pokud stránka (název nebo obsah) obsahuje hledaný výraz. */
export function kbPageMatches(title: string, content: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return title.toLowerCase().includes(q) || content.toLowerCase().includes(q);
}

/**
 * Výřez textu okolo prvního výskytu `query` v `text`, rozdělený na část před/
 * shodu/po — k renderu jako `<mark>` v `HighlightedSnippet`. `null`, když se
 * výraz v textu vůbec nevyskytuje (hledaný výraz může být jen v titulku).
 */
export function findSnippet(text: string, query: string): Snippet | null {
  const q = query.trim();
  if (!q) return null;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return null;

  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + q.length + SNIPPET_RADIUS);
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, idx),
    match: text.slice(idx, idx + q.length),
    after: text.slice(idx + q.length, end) + (end < text.length ? '…' : ''),
  };
}
