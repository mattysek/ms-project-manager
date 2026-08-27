// Správa milníků — hlavička s počtem a tlačítkem, pod ní karty seřazené podle týdne.
import type { Milestone, Week } from '../../../types';
import { MilestoneCard } from './MilestoneCard';
import type { MilestoneEditing } from './useMilestoneEditing';

interface MilestonesSectionProps {
  milestones: Milestone[];
  weeks: Week[];
  editing: MilestoneEditing;
}

function SectionHeader({
  count,
  canAdd,
  onAdd,
}: {
  count: number;
  canAdd: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      style={{
        background: '#161b27',
        padding: '10px 16px',
        borderBottom: '1px solid #1e2533',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: '#64748b',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        Správa milníků
      </div>
      <span style={{ fontSize: 9, color: '#475569' }}>{count} milníků</span>
      <button
        type="button"
        className="btn"
        onClick={onAdd}
        disabled={!canAdd}
        style={{
          marginLeft: 'auto',
          padding: '4px 12px',
          background: '#0d2210',
          borderColor: '#34d39944',
          color: '#6ee7b7',
          fontSize: 10,
          opacity: canAdd ? 1 : 0.5,
        }}
      >
        + Přidat milník
      </button>
    </div>
  );
}

function EmptyHint({ hasWeeks }: { hasWeeks: boolean }) {
  return (
    <div
      style={{
        padding: '20px',
        textAlign: 'center',
        color: '#475569',
        fontSize: 11,
        fontStyle: 'italic',
      }}
    >
      {hasWeeks
        ? 'Žádné milníky · Klikněte na "+ Přidat milník" pro vytvoření'
        : 'Nejprve nastavte datum začátku a konce projektu'}
    </div>
  );
}

export function MilestonesSection({ milestones, weeks, editing }: MilestonesSectionProps) {
  const sorted = [...milestones].sort((a, b) => a.weekIndex - b.weekIndex);

  return (
    <div
      style={{
        border: '1px solid #1e2533',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 22,
      }}
    >
      <SectionHeader
        count={milestones.length}
        canAdd={weeks.length > 0}
        onAdd={editing.addMilestone}
      />
      <div style={{ padding: '12px 16px' }}>
        {sorted.length === 0 ? (
          <EmptyHint hasWeeks={weeks.length > 0} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sorted.map((milestone) => (
              <MilestoneCard
                key={milestone.id}
                milestone={milestone}
                weeks={weeks}
                editing={editing}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
