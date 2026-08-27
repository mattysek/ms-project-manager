// Jedna buňka záhlaví týdne — popisek, svátky, milníky, počet pracovních dní.
import type { Milestone, WeekWithHolidays } from '../../../types';
import { CELL_W } from '../../../constants';
import { isMilestoneComplete, weekLabelColor } from './milestones';

interface WeekHeaderCellProps {
  week: WeekWithHolidays;
  isCurrent: boolean;
  milestones: Milestone[];
}

/** Vlaječky milníků pod popiskem týdne — zelená splněný, červená nesplněný. */
function MilestoneFlags({ milestones }: { milestones: Milestone[] }) {
  return (
    <>
      {milestones.map((milestone) => (
        <div
          key={milestone.id}
          style={{
            fontSize: 8,
            color: isMilestoneComplete(milestone) ? '#34d399' : '#f87171',
            fontWeight: 700,
          }}
        >
          ⚑ {milestone.title}
        </div>
      ))}
    </>
  );
}

export function WeekHeaderCell({ week, isCurrent, milestones }: WeekHeaderCellProps) {
  const hasMilestones = milestones.length > 0;
  const hasIncomplete = milestones.some((m) => !isMilestoneComplete(m));
  const labelColor = weekLabelColor(isCurrent, hasMilestones, hasIncomplete);
  const holidayNames = week.holidays.map((h) => h.name).join(', ');
  const holidayTitle = holidayNames
    ? `${holidayNames} — ${week.workdays} pracovních dní`
    : undefined;

  return (
    <div
      title={holidayTitle}
      style={{
        width: CELL_W,
        flexShrink: 0,
        textAlign: 'center',
        lineHeight: 1.4,
        background: isCurrent ? '#1a3a5c' : 'transparent',
        borderRadius: isCurrent ? 4 : 0,
        padding: isCurrent ? '2px 0' : 0,
        margin: isCurrent ? '-2px 0' : 0,
        boxShadow: isCurrent ? '0 0 8px #4f9cf944' : 'none',
      }}
    >
      <div style={{ fontSize: 9, color: labelColor, fontWeight: isCurrent ? 700 : 400 }}>
        {week.label}
        {week.holidays.length > 0 && (
          <span role="img" aria-label="Obsahuje státní svátek" style={{ color: '#fbbf24' }}>
            {' '}
            ⛱
          </span>
        )}
      </div>
      <MilestoneFlags milestones={milestones} />
      <div style={{ fontSize: 8, color: isCurrent ? '#4f9cf9' : '#334155' }}>
        {isCurrent ? '● dnes' : `${week.workdays}d`}
      </div>
    </div>
  );
}
