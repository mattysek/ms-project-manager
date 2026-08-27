import type { Opportunity } from '../../../types';
import { OpportunityCardActions } from './OpportunityCardActions';
import { OpportunityCardBody } from './OpportunityCardBody';

interface OpportunityCardProps {
  o: Opportunity;
  isEditing: boolean;
  /** Právě přidaná, ještě nepotvrzená příležitost — dokončovací tlačítko píše "Přidat", ne "Uložit". */
  isNew: boolean;
  /** PM smí editovat/mazat příležitosti, Dev jen číst (PRD-03 FR-ROLE-01). */
  canWrite: boolean;
  onUpdate: (id: string, field: keyof Opportunity, value: string) => void;
  onDelete: (id: string) => void;
  onToggleEdit: (id: string | null) => void;
}

export function OpportunityCard({
  o,
  isEditing,
  isNew,
  canWrite,
  onUpdate,
  onDelete,
  onToggleEdit,
}: OpportunityCardProps) {
  return (
    <div
      style={{
        background: '#0a2a10',
        border: '1px solid #22c55e55',
        borderRadius: 8,
        padding: '14px 16px',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: isEditing ? 8 : 6,
        }}
      >
        <span style={{ color: '#22c55e', fontSize: 12 }}>✦</span>
        {canWrite && (
          <OpportunityCardActions
            id={o.id}
            isEditing={isEditing}
            isNew={isNew}
            onToggleEdit={onToggleEdit}
            onDelete={onDelete}
          />
        )}
      </div>
      <OpportunityCardBody o={o} isEditing={isEditing} onUpdate={onUpdate} />
    </div>
  );
}
