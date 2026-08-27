import type { Risk } from '../../../types';
import type { MemberRole } from '../../../types/protocol';
import { PermissionGate } from '../../PermissionGate';
import { RiskCard } from './RiskCard';

interface RiskEditingState {
  editR: string | null;
  newR: string | null;
  toggleEditR: (id: string | null) => void;
  updR: (id: string, f: keyof Risk, v: string) => void;
  delR: (id: string) => void;
  addR: () => void;
}

interface RisksSectionProps {
  /** Seřazená dle závažnosti HIGH → MEDIUM → LOW (Scenario: Rizika jsou seřazena dle závažnosti). */
  sortedRisks: Risk[];
  canWrite: boolean;
  role: MemberRole | null;
  editing: RiskEditingState;
}

/** Sloupec „⚠ Rizika" — počty dle závažnosti, tlačítko přidání a seznam karet. */
export function RisksSection({ sortedRisks, canWrite, role, editing }: RisksSectionProps) {
  return (
    <div style={{ flex: '1 1 400px', minWidth: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10,
            color: '#64748b',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          ⚠ Rizika
        </div>
        <span style={{ fontSize: 9, color: '#475569' }}>
          {sortedRisks.filter((r) => r.sev === 'high').length} vysoká ·{' '}
          {sortedRisks.filter((r) => r.sev === 'med').length} střední ·{' '}
          {sortedRisks.filter((r) => r.sev === 'low').length} nízká
        </span>
        <PermissionGate role={role} require="pm">
          <button
            type="button"
            className="btn"
            onClick={editing.addR}
            style={{
              marginLeft: 'auto',
              padding: '3px 12px',
              background: '#0d2210',
              borderColor: '#34d39944',
              color: '#6ee7b7',
              fontSize: 10,
            }}
          >
            + Přidat riziko
          </button>
        </PermissionGate>
      </div>
      {sortedRisks.map((r) => (
        <RiskCard
          key={r.id}
          r={r}
          isEditing={editing.editR === r.id}
          isNew={r.id === editing.newR}
          canWrite={canWrite}
          onUpdate={editing.updR}
          onDelete={editing.delR}
          onToggleEdit={editing.toggleEditR}
        />
      ))}
    </div>
  );
}
