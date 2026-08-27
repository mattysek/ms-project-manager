import type { Risk, Severity } from '../../../types';
import { RiskCardActions } from './RiskCardActions';
import { RiskSeverityField } from './RiskSeverityField';

interface RiskCardHeaderProps {
  r: Risk;
  isEditing: boolean;
  isNew: boolean;
  canWrite: boolean;
  onUpdate: (id: string, field: keyof Risk, value: string) => void;
  onDelete: (id: string) => void;
  onToggleEdit: (id: string | null) => void;
}

/** Horní řádek karty rizika — závažnost, „kdo" a akce editace/smazání. */
export function RiskCardHeader({
  r,
  isEditing,
  isNew,
  canWrite,
  onUpdate,
  onDelete,
  onToggleEdit,
}: RiskCardHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: isEditing ? 8 : 6,
      }}
    >
      <RiskSeverityField
        sev={r.sev}
        isEditing={isEditing}
        onChange={(sev: Severity) => onUpdate(r.id, 'sev', sev)}
      />
      {isEditing ? (
        <input
          className="inp"
          value={r.who}
          placeholder="Kdo…"
          onChange={(e) => onUpdate(r.id, 'who', e.target.value)}
          style={{ width: 120, flexShrink: 0 }}
        />
      ) : (
        <span style={{ color: '#64748b', fontSize: 10 }}>{r.who}</span>
      )}
      {canWrite && (
        <RiskCardActions
          id={r.id}
          isEditing={isEditing}
          isNew={isNew}
          onToggleEdit={onToggleEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
