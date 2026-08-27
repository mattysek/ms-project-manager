// Zvýraznění hledaného výrazu v seznamu poznámek (FR-QN-02, fulltext).
import { Fragment } from 'react';

export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx = lower.indexOf(needle, cursor);
  let key = 0;
  while (idx !== -1) {
    parts.push(<Fragment key={key++}>{text.slice(cursor, idx)}</Fragment>);
    parts.push(
      <mark key={key++} style={{ background: '#4f9cf955', color: '#f1f5f9' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    cursor = idx + query.length;
    idx = lower.indexOf(needle, cursor);
  }
  parts.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>);
  return parts;
}
