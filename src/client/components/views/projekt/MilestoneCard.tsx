// Jeden milník v editoru — hlavička (název, týden, počet splněných) a checklist.
import type { Milestone, MilestoneCheckItem, Week } from '../../../types';
import type { MilestoneEditing } from './useMilestoneEditing';
import { isMilestoneComplete } from './milestoneHelpers';

interface MilestoneCardProps {
  milestone: Milestone;
  weeks: Week[];
  editing: MilestoneEditing;
}

/** Křížek pro smazání — barva se mění jen hoverem, proto inline handlery. */
function DeleteButton({
  label,
  onClick,
  idleColor,
  fontSize,
}: {
  label?: string;
  onClick: () => void;
  idleColor: string;
  fontSize: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: idleColor,
        cursor: 'pointer',
        fontSize,
        padding: fontSize === 14 ? '2px 6px' : '2px 4px',
        transition: 'color .15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
      onMouseLeave={(e) => (e.currentTarget.style.color = idleColor)}
    >
      ✕
    </button>
  );
}

function MilestoneHeader({ milestone, weeks, editing }: MilestoneCardProps) {
  const isComplete = isMilestoneComplete(milestone);
  const completedCount = milestone.checkItems.filter((i) => i.completed).length;
  const totalCount = milestone.checkItems.length;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: isComplete ? '#0d2210' : '#2a0a0a',
        borderBottom: `1px solid ${isComplete ? '#34d39933' : '#f8717133'}`,
      }}
    >
      <span style={{ fontSize: 14, color: isComplete ? '#34d399' : '#f87171' }}>⚑</span>
      <input
        className="inp"
        aria-label={`Název milníku — ${milestone.title}`}
        value={milestone.title}
        onChange={(e) => editing.updateMilestone(milestone.id, { title: e.target.value })}
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 600,
          color: isComplete ? '#6ee7b7' : '#fca5a5',
          background: 'transparent',
          border: 'none',
          padding: 0,
        }}
      />
      <select
        className="inp"
        aria-label={`Týden milníku — ${milestone.title}`}
        value={milestone.weekIndex}
        onChange={(e) =>
          editing.updateMilestone(milestone.id, { weekIndex: Number(e.target.value) })
        }
        style={{ width: 120, fontSize: 10, color: '#94a3b8', cursor: 'pointer' }}
      >
        {weeks.map((w, idx) => (
          <option key={w.w} value={idx} style={{ background: '#0c1018', color: '#e2e8f0' }}>
            W{idx + 1}: {w.label}
          </option>
        ))}
      </select>
      <span style={{ fontSize: 9, color: isComplete ? '#34d399' : '#f59e0b', fontWeight: 600 }}>
        {totalCount > 0 ? `${completedCount}/${totalCount}` : '—'}
      </span>
      <DeleteButton
        label={`Smazat milník — ${milestone.title}`}
        onClick={() => editing.deleteMilestone(milestone.id)}
        idleColor="#475569"
        fontSize={14}
      />
    </div>
  );
}

function CheckItemRow({
  milestoneId,
  item,
  editing,
}: {
  milestoneId: string;
  item: MilestoneCheckItem;
  editing: MilestoneEditing;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="checkbox"
        checked={item.completed}
        onChange={(e) =>
          editing.updateCheckItem(milestoneId, item.id, { completed: e.target.checked })
        }
        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#34d399' }}
      />
      <input
        className="inp"
        value={item.text}
        placeholder="Položka checklistu..."
        onChange={(e) => editing.updateCheckItem(milestoneId, item.id, { text: e.target.value })}
        style={{
          flex: 1,
          fontSize: 11,
          color: item.completed ? '#64748b' : '#e2e8f0',
          textDecoration: item.completed ? 'line-through' : 'none',
        }}
      />
      <DeleteButton
        label={`Smazat položku — ${item.text}`}
        onClick={() => editing.deleteCheckItem(milestoneId, item.id)}
        idleColor="#334155"
        fontSize={12}
      />
    </div>
  );
}

function AddCheckItemButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: '1px dashed #2d3748',
        borderRadius: 4,
        color: '#64748b',
        cursor: 'pointer',
        fontSize: 9,
        padding: '4px 10px',
        fontFamily: 'inherit',
        transition: 'all .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#6ee7b7';
        e.currentTarget.style.color = '#6ee7b7';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#2d3748';
        e.currentTarget.style.color = '#64748b';
      }}
    >
      + Přidat položku
    </button>
  );
}

function Checklist({ milestone, editing }: { milestone: Milestone; editing: MilestoneEditing }) {
  return (
    <div style={{ padding: '10px 14px' }}>
      {milestone.checkItems.length === 0 ? (
        <div style={{ fontSize: 10, color: '#475569', fontStyle: 'italic', marginBottom: 8 }}>
          Žádné položky checklistu
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {milestone.checkItems.map((item) => (
            <CheckItemRow key={item.id} milestoneId={milestone.id} item={item} editing={editing} />
          ))}
        </div>
      )}
      <AddCheckItemButton onClick={() => editing.addCheckItem(milestone.id)} />
    </div>
  );
}

export function MilestoneCard({ milestone, weeks, editing }: MilestoneCardProps) {
  const isComplete = isMilestoneComplete(milestone);
  return (
    <div
      style={{
        border: `1px solid ${isComplete ? '#34d39955' : '#f8717155'}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: isComplete ? '#0d22100a' : '#2a0a0a0a',
      }}
    >
      <MilestoneHeader milestone={milestone} weeks={weeks} editing={editing} />
      <Checklist milestone={milestone} editing={editing} />
    </div>
  );
}
