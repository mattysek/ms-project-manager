import type { ChangelogEntry } from '../../../../types';
import { ChangelogEntryRow } from './ChangelogEntryRow';

interface ChangelogEntryListProps {
  entries: ChangelogEntry[];
  editingId: string | null;
  editText: string;
  canWrite: boolean;
  onSetEditText: (v: string) => void;
  onStartEdit: (entry: ChangelogEntry) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
}

/** Seznam záznamů changelogu — prázdný stav, jinak řádek na záznam. */
export function ChangelogEntryList({
  entries,
  editingId,
  editText,
  canWrite,
  onSetEditText,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: ChangelogEntryListProps) {
  return (
    <div style={{ flex: 1, maxHeight: 350, overflowY: 'auto' }}>
      {entries.length === 0 ? (
        <div
          style={{
            padding: '20px 16px',
            textAlign: 'center',
            color: '#334155',
            fontSize: 11,
          }}
        >
          Zatím žádné záznamy
        </div>
      ) : (
        entries.map((entry) => (
          <ChangelogEntryRow
            key={entry.id}
            entry={entry}
            isEditing={editingId === entry.id}
            editText={editText}
            canWrite={canWrite}
            onSetEditText={onSetEditText}
            onStartEdit={onStartEdit}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  );
}
