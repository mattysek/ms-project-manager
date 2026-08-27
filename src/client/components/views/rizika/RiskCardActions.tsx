import { editButtonLabel } from './editButtonLabel';

interface RiskCardActionsProps {
  id: string;
  isEditing: boolean;
  isNew: boolean;
  onToggleEdit: (id: string | null) => void;
  onDelete: (id: string) => void;
}

/** Dokončit/Edit + smazat — jen pro PM (`canWrite`), rozhoduje volající. */
export function RiskCardActions({
  id,
  isEditing,
  isNew,
  onToggleEdit,
  onDelete,
}: RiskCardActionsProps) {
  return (
    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
      <button
        type="button"
        className="btn"
        onClick={() => onToggleEdit(isEditing ? null : id)}
        style={{
          padding: '2px 9px',
          fontSize: 10,
          background: '#161b27',
          borderColor: '#2d3748',
          color: '#94a3b8',
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
