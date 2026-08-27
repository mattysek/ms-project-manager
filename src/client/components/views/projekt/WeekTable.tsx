// Přehled týdnů — zároveň drop zóna pro přetažení milníku na jiný týden.
import type { ReactNode } from 'react';
import type { Milestone, WeekWithHolidays } from '../../../types';
import { isMilestoneComplete, weekRowBg } from './milestoneHelpers';
import type { MilestoneDrag } from './useMilestoneDrag';

const COLUMNS = ['#', 'Týden', 'Od', 'Do', 'Prac. dní', 'Svátky', 'Milník'];

interface WeekTableProps {
  weeks: WeekWithHolidays[];
  milestones: Milestone[];
  drag: MilestoneDrag;
}

function TableHead() {
  return (
    <thead>
      <tr style={{ borderBottom: '1px solid #1e2533', background: '#141920' }}>
        {COLUMNS.map((h, i) => (
          <th
            key={h}
            style={{
              padding: '6px 12px',
              textAlign: i >= 4 ? 'center' : 'left',
              color: '#475569',
              fontWeight: 500,
              fontSize: 10,
              whiteSpace: 'nowrap',
            }}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** Přetahovatelný štítek milníku v buňce týdne. */
function MilestoneChip({
  milestone,
  isDragging,
  drag,
}: {
  milestone: Milestone;
  isDragging: boolean;
  drag: MilestoneDrag;
}) {
  const isComplete = isMilestoneComplete(milestone);
  return (
    // Přetažení štítku milníku na jiný týden v tabulce — čistě myší gesto
    // (nativní HTML5 drag-and-drop). Klávesnicová náhrada existuje: select
    // "Týden" u milníku v editoru výše nastavuje stejné `weekIndex` bez tahu myší.
    // biome-ignore lint/a11y/noStaticElementInteractions: myší drag přesun milníku, klávesnicová náhrada je select Týden v editoru milníků
    <span
      draggable
      onDragStart={(e) => drag.onMilestoneDragStart(e, milestone.id)}
      onDragEnd={drag.onMilestoneDragEnd}
      style={{
        display: 'inline-block',
        fontSize: 9,
        padding: '2px 10px',
        background: isComplete ? '#0d2210' : '#2a0a0a',
        border: `1px solid ${isComplete ? '#34d39966' : '#f8717155'}`,
        borderRadius: 4,
        color: isComplete ? '#6ee7b7' : '#f87171',
        fontWeight: 700,
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        transition: 'all .15s',
      }}
    >
      ⚑ {milestone.title}
    </span>
  );
}

/** Tři stavy buňky milníku: má milníky / je cílem přetažení / prázdná. */
function MilestoneCell({
  weekMilestones,
  isDropTarget,
  drag,
}: {
  weekMilestones: Milestone[];
  isDropTarget: boolean;
  drag: MilestoneDrag;
}): ReactNode {
  if (weekMilestones.length > 0) {
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        {weekMilestones.map((milestone) => (
          <MilestoneChip
            key={milestone.id}
            milestone={milestone}
            isDragging={drag.draggingMilestoneId === milestone.id}
            drag={drag}
          />
        ))}
      </div>
    );
  }
  if (isDropTarget) {
    return (
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 9, color: '#4f9cf9', fontStyle: 'italic' }}>↓ Pusťte sem</span>
      </div>
    );
  }
  return (
    <div style={{ textAlign: 'center' }}>
      <span style={{ color: '#1e2533', fontSize: 9 }}>—</span>
    </div>
  );
}

function HolidayCell({ holidays }: { holidays: { iso: string; name: string }[] }) {
  if (holidays.length === 0) return <span style={{ color: '#1e2533', fontSize: 9 }}>—</span>;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {holidays.map((h) => (
        <span
          key={h.iso}
          style={{
            fontSize: 9,
            padding: '1px 6px',
            background: '#2a1010',
            border: '1px solid #f8717133',
            borderRadius: 3,
            color: '#fca5a5',
            whiteSpace: 'nowrap',
          }}
        >
          {h.name}
        </span>
      ))}
    </div>
  );
}

function WeekRow({
  week,
  index,
  weekMilestones,
  drag,
}: {
  week: WeekWithHolidays;
  index: number;
  weekMilestones: Milestone[];
  drag: MilestoneDrag;
}) {
  const isDropTarget = drag.dropTargetWeekIdx === index && !!drag.draggingMilestoneId;
  const dateCell: React.CSSProperties = {
    padding: '6px 12px',
    color: '#475569',
    fontSize: 10,
    whiteSpace: 'nowrap',
  };

  return (
    <tr
      // Drop zóna milníku — index týdne je jediné, čím se řádky
      // od sebe v testu spolehlivě odliší.
      data-week-index={index}
      onDragOver={(e) => drag.onWeekDragOver(e, index)}
      onDragLeave={drag.onWeekDragLeave}
      onDrop={(e) => drag.onWeekDrop(e, index)}
      style={{
        borderBottom: '1px solid #1e253344',
        background: weekRowBg(isDropTarget, index),
        transition: 'background .15s',
      }}
    >
      <td style={{ padding: '6px 12px', color: '#334155' }}>{week.w}</td>
      <td style={{ padding: '6px 12px', color: '#e2e8f0', fontWeight: 500 }}>{week.label}</td>
      <td style={dateCell}>{week.mondayISO}</td>
      <td style={dateCell}>{week.fridayISO}</td>
      <td
        style={{
          padding: '6px 12px',
          textAlign: 'center',
          fontWeight: 700,
          color: week.workdays < 5 ? '#fbbf24' : '#34d399',
        }}
      >
        {week.workdays}
      </td>
      <td style={{ padding: '6px 12px' }}>
        <HolidayCell holidays={week.holidays} />
      </td>
      <td style={{ padding: '6px 12px' }}>
        <MilestoneCell weekMilestones={weekMilestones} isDropTarget={isDropTarget} drag={drag} />
      </td>
    </tr>
  );
}

function TableFoot({ totalWorkdays }: { totalWorkdays: number }) {
  return (
    <tfoot>
      <tr style={{ background: '#161b27', borderTop: '2px solid #1e2533' }}>
        <td colSpan={4} style={{ padding: '8px 12px', color: '#475569', fontSize: 10 }}>
          CELKEM
        </td>
        <td
          style={{
            padding: '8px 12px',
            textAlign: 'center',
            fontWeight: 700,
            color: '#4f9cf9',
            fontSize: 13,
          }}
        >
          {totalWorkdays}
        </td>
        <td colSpan={2} style={{ padding: '8px 12px', color: '#334155', fontSize: 9 }}>
          ⚑ = přetáhni pro změnu týdne ·<span style={{ color: '#34d399' }}>zelená</span> = splněno ·
          <span style={{ color: '#f87171' }}>červená</span> = nesplněno
        </td>
      </tr>
    </tfoot>
  );
}

export function WeekTable({ weeks, milestones, drag }: WeekTableProps) {
  const totalWorkdays = weeks.reduce((s, w) => s + w.workdays, 0);

  return (
    <div style={{ border: '1px solid #1e2533', borderRadius: 10, overflow: 'hidden' }}>
      <div
        style={{
          background: '#161b27',
          padding: '10px 16px',
          borderBottom: '1px solid #1e2533',
          fontSize: 10,
          color: '#64748b',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        Přehled týdnů · milníky lze přetáhnout na jiný týden
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <TableHead />
          <tbody>
            {weeks.map((w, i) => (
              <WeekRow
                key={w.w}
                week={w}
                index={i}
                weekMilestones={milestones.filter((m) => m.weekIndex === i)}
                drag={drag}
              />
            ))}
          </tbody>
          <TableFoot totalWorkdays={totalWorkdays} />
        </table>
      </div>
    </div>
  );
}
