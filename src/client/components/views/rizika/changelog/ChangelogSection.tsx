// ── CHANGELOG SECTION ──────────────────────────────────────────────────────────
import type { ChangelogEntry, Project } from '../../../../types';
import type { MemberRole } from '../../../../types/protocol';
import { ChangelogEntryList } from './ChangelogEntryList';
import { ChangelogHeader } from './ChangelogHeader';
import { ChangelogNewEntryForm } from './ChangelogNewEntryForm';
import { useChangelogEditing } from './useChangelogEditing';

interface ChangelogSectionProps {
  changelog: ChangelogEntry[];
  updateProject: (field: keyof Project, val: string | number | ChangelogEntry[]) => void;
  role: MemberRole | null;
}

export function ChangelogSection({ changelog, updateProject, role }: ChangelogSectionProps) {
  const canWrite = role === 'pm';
  const editing = useChangelogEditing(changelog, updateProject);

  return (
    <div
      style={{
        border: '1px solid #1e2533',
        borderRadius: 10,
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ChangelogHeader />
      <ChangelogNewEntryForm
        role={role}
        draft={editing.newEntry}
        onChange={editing.setNewEntry}
        onAdd={editing.addEntry}
      />
      <ChangelogEntryList
        entries={editing.sortedChangelog}
        editingId={editing.editingId}
        editText={editing.editText}
        canWrite={canWrite}
        onSetEditText={editing.setEditText}
        onStartEdit={editing.startEdit}
        onSaveEdit={editing.saveEdit}
        onCancelEdit={editing.cancelEdit}
        onDelete={editing.deleteEntry}
      />
    </div>
  );
}
