import type { Opportunity } from '../../../types';
import type { MemberRole } from '../../../types/protocol';
import { PermissionGate } from '../../PermissionGate';
import { OpportunityCard } from './OpportunityCard';

interface OpportunityEditingState {
  editO: string | null;
  newO: string | null;
  toggleEditO: (id: string | null) => void;
  updO: (id: string, f: keyof Opportunity, v: string) => void;
  delO: (id: string) => void;
  addO: () => void;
}

interface OpportunitiesSectionProps {
  opps: Opportunity[];
  canWrite: boolean;
  role: MemberRole | null;
  editing: OpportunityEditingState;
}

/** Sloupec „✦ Příležitosti" — tlačítko přidání a seznam karet. */
export function OpportunitiesSection({ opps, canWrite, role, editing }: OpportunitiesSectionProps) {
  return (
    <div style={{ flex: '1 1 400px', minWidth: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10,
            color: '#22c55e',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          ✦ Příležitosti
        </div>
        <PermissionGate role={role} require="pm">
          <button
            type="button"
            className="btn"
            onClick={editing.addO}
            style={{
              marginLeft: 'auto',
              padding: '3px 12px',
              background: '#0a2a10',
              borderColor: '#22c55e44',
              color: '#86efac',
              fontSize: 10,
            }}
          >
            + Přidat příležitost
          </button>
        </PermissionGate>
      </div>
      {opps.map((o) => (
        <OpportunityCard
          key={o.id}
          o={o}
          isEditing={editing.editO === o.id}
          isNew={o.id === editing.newO}
          canWrite={canWrite}
          onUpdate={editing.updO}
          onDelete={editing.delO}
          onToggleEdit={editing.toggleEditO}
        />
      ))}
    </div>
  );
}
