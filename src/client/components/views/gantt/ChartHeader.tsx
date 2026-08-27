// Záhlaví Ganttu: pruh měsíců, řádek týdnů a legenda kategorií pod grafem.
import type { Categories, Milestone, MonthGroup, WeekWithHolidays } from '../../../types';
import { CELL_W, NAME_W } from '../../../constants';
import { WeekHeaderCell } from './WeekHeaderCell';
import { milestonesForWeek } from './milestones';

/** Přilepená mezera nad jmenovkami osob, aby záhlaví sedělo s mřížkou týdnů. */
function StickySpacer() {
  return (
    <div
      style={{
        width: NAME_W + 2,
        flexShrink: 0,
        position: 'sticky',
        left: 0,
        background: '#0f1117',
        zIndex: 5,
        boxShadow: '4px 0 8px -2px rgba(0,0,0,0.3)',
      }}
    />
  );
}

export function MonthGroupsRow({ monthGroups }: { monthGroups: MonthGroup[] }) {
  return (
    <div style={{ display: 'flex', marginBottom: 3 }}>
      <StickySpacer />
      {monthGroups.map((mg) => (
        <div
          key={mg.mIdx}
          style={{
            width: mg.weeks * CELL_W - 2,
            marginRight: 2,
            background: `${mg.color}44`,
            border: `1px solid ${mg.color}88`,
            borderRadius: 3,
            textAlign: 'center',
            fontSize: 9,
            fontWeight: 700,
            color: '#94a3b8',
            letterSpacing: '0.12em',
            padding: '2px 0',
          }}
        >
          {mg.label.toUpperCase()}
        </div>
      ))}
    </div>
  );
}

export function WeekHeaderRow({
  weeks,
  currentWeekIdx,
  milestones,
}: {
  weeks: WeekWithHolidays[];
  currentWeekIdx: number;
  milestones: Milestone[];
}) {
  return (
    <div style={{ display: 'flex', marginBottom: 8 }}>
      <StickySpacer />
      {weeks.map((w, idx) => (
        <WeekHeaderCell
          key={w.w}
          week={w}
          isCurrent={idx === currentWeekIdx}
          milestones={milestonesForWeek(milestones, w.w - 1)}
        />
      ))}
    </div>
  );
}

export function CategoryLegend({ cats }: { cats: Categories }) {
  return (
    <div
      style={{
        borderTop: '1px solid #1e2533',
        paddingTop: 10,
        marginTop: 4,
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {Object.entries(cats).map(([k, v]) => (
        <div
          key={k}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#475569' }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              background: v.bg,
              border: `1px solid ${v.bd}`,
              borderRadius: 2,
            }}
          />
          {v.label}
        </div>
      ))}
      <div style={{ marginLeft: 'auto', fontSize: 9, color: '#334155' }}>
        tažení = přesun · okraje = změna délky · hover = náhled · klik = detail
      </div>
    </div>
  );
}
