import type { ChangelogEntry } from '../../../../types';
import { ChangelogEntryDisplay } from './ChangelogEntryDisplay';
import { ChangelogEntryEditForm } from './ChangelogEntryEditForm';
import { formatChangelogDate } from './formatChangelogDate';

interface ChangelogEntryRowProps {
  entry: ChangelogEntry;
  isEditing: boolean;
  editText: string;
  canWrite: boolean;
  onSetEditText: (v: string) => void;
  onStartEdit: (entry: ChangelogEntry) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
}

/** Jeden řádek changelogu — datum vlevo, vpravo needitující text nebo editační formulář. */
export function ChangelogEntryRow({
  entry,
  isEditing,
  editText,
  canWrite,
  onSetEditText,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: ChangelogEntryRowProps) {
  return (
    <div
      style={{
        padding: '10px 16px',
        borderBottom: '1px solid #1e253344',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 9, color: '#475569', minWidth: 70, paddingTop: 2 }}>
        {formatChangelogDate(entry.date)}
      </div>
      {isEditing ? (
        <ChangelogEntryEditForm
          editText={editText}
          onChangeText={onSetEditText}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <ChangelogEntryDisplay
          text={entry.text}
          canWrite={canWrite}
          onEdit={() => onStartEdit(entry)}
          onDelete={() => onDelete(entry.id)}
        />
      )}
    </div>
  );
}
