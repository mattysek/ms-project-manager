import { editButtonLabel } from './editButtonLabel';

interface OpportunityCardActionsProps {
  id: string;
  isEditing: boolean;
  isNew: boolean;
  onToggleEdit: (id: string | null) => void;
  onDelete: (id: string) => void;
}

/** Dokončit/Edit + smazat — jen pro PM (`canWrite`), rozhoduje volající. */
export function OpportunityCardActions({
  id,
  isEditing,
  isNew,
  onToggleEdit,
  onDelete,
}: OpportunityCardActionsProps) {
  return (
    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
      <button
        type="button"
        className="btn"
        onClick={() => onToggleEdit(isEditing ? null : id)}
        style={{
          padding: '2px 9px',
          fontSize: 10,
          background: '#0a2a10',
          borderColor: '#22c55e44',
          color: '#4ade80',
        }}
      >
        {editButtonLabel(isEditing, isNew)}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => onDelete(id)}
        style={{
          padding: '2px 9px',
          fontSize: 10,
          background: '#2a1010',
          borderColor: '#f8717144',
          color: '#f87171',
        }}
      >
        ✕
      </button>
    </div>
  );
}
