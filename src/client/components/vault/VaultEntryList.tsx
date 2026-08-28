// Seznam záznamů trezoru s hledáním — FR-VAULT-06, FR-VAULT-07.
//
// Hledá se **na klientovi** nad dešifrovanými daty. Na server nejde ani
// hledaný výraz — ten by o obsahu trezoru prozradil víc, než je zdrávo
// (ADR-016).
import { useMemo, useState } from 'react';
import type { VaultEntry } from '../../hooks/useVault';
import { useClipboardCopy } from '../../hooks/useClipboardCopy';

interface VaultEntryListProps {
  entries: VaultEntry[];
  onEdit: (entry: VaultEntry) => void;
  onDelete: (entry: VaultEntry) => void;
}

function matches(entry: VaultEntry, needle: string): boolean {
  const haystack = `${entry.title} ${entry.username} ${entry.url}`.toLocaleLowerCase('cs');
  return haystack.includes(needle);
}

/** Jeden řádek. Heslo je maskované, dokud si ho uživatel nevyžádá (FR-VAULT-06). */
function EntryRow({
  entry,
  copiedId,
  onCopy,
  onEdit,
  onDelete,
}: {
  entry: VaultEntry;
  copiedId: string | null;
  onCopy: (entry: VaultEntry) => void;
  onEdit: (entry: VaultEntry) => void;
  onDelete: (entry: VaultEntry) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <li style={ROW_STYLE}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{entry.title}</span>
        {entry.username && <span style={{ fontSize: 10, color: '#94a3b8' }}>{entry.username}</span>}
      </div>
      {entry.url && (
        <div style={{ fontSize: 10, color: '#64748b', wordBreak: 'break-all' }}>{entry.url}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <code style={{ fontSize: 11, color: revealed ? '#e2e8f0' : '#475569', flex: 1 }}>
          {revealed ? entry.password : '••••••••••'}
        </code>
        <button
          type="button"
          className="btn"
          onClick={() => setRevealed((value) => !value)}
          aria-label={`${revealed ? 'Skrýt' : 'Zobrazit'} heslo — ${entry.title}`}
          style={SMALL_BUTTON}
        >
          {revealed ? '🙈' : '👁'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onCopy(entry)}
          aria-label={`Kopírovat heslo — ${entry.title}`}
          style={SMALL_BUTTON}
        >
          {copiedId === entry.id ? '✓' : '⧉'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onEdit(entry)}
          aria-label={`Upravit záznam — ${entry.title}`}
          style={SMALL_BUTTON}
        >
          ✎
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onDelete(entry)}
          aria-label={`Smazat záznam — ${entry.title}`}
          style={{ ...SMALL_BUTTON, color: '#fca5a5', borderColor: '#f8717144' }}
        >
          ×
        </button>
      </div>
    </li>
  );
}

export function VaultEntryList({ entries, onEdit, onDelete }: VaultEntryListProps) {
  const [search, setSearch] = useState('');
  const { copiedId, copy } = useClipboardCopy();

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('cs');
    return needle ? entries.filter((entry) => matches(entry, needle)) : entries;
  }, [entries, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      <input
        className="inp"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Hledat v trezoru…"
        aria-label="Hledat v trezoru"
      />
      {visible.length === 0 && (
        <div style={{ fontSize: 11, color: '#64748b', padding: '8px 0' }}>
          {entries.length === 0 ? 'Trezor je prázdný.' : 'Nic neodpovídá hledání.'}
        </div>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto' }}>
        {visible.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            copiedId={copiedId}
            onCopy={(target) => copy(target.id, target.password)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}

const ROW_STYLE = {
  border: '1px solid #1e2533',
  borderRadius: 6,
  padding: '8px 10px',
  marginBottom: 6,
  background: '#0c1018',
} as const;

const SMALL_BUTTON = {
  background: '#161b27',
  borderColor: '#2d3748',
  color: '#94a3b8',
  padding: '2px 7px',
  fontSize: 11,
} as const;
