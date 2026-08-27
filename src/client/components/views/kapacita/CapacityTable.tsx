// Tabulka alokací po týdnech včetně záhlaví s měsíci a součtového řádku.
import type { MonthGroup, PersonWithWeeks, Roles, Week } from '../../../types';
import type { Member } from '../../../api/membersApi';
import type { MemberRole } from '../../../types/protocol';
import { PermissionGate } from '../../PermissionGate';
import { CapacityRow } from './CapacityRow';
import { budgetColor } from './colors';
import type { CapacityTotals } from './useCapacityTotals';
import type { PeopleEditing } from './usePeopleEditing';
import type { WeeklyLoad } from './useWeeklyLoad';

interface CapacityTableProps {
  people: PersonWithWeeks[];
  weeks: Week[];
  monthGroups: MonthGroup[];
  roles: Roles;
  budget: number;
  role: MemberRole | null;
  totals: CapacityTotals;
  /** Zatížení po týdnech — zvýrazní přetížené buňky (kapacita.feature). */
  weeklyLoad: WeeklyLoad;
  /** Členové projektu — nabídka pro přiřazení účtu k osobě (FR-ROLE-07). */
  members: Member[];
  editing: PeopleEditing;
  /** ADR-006: Dev smí přepisovat jen alokaci osoby navázané na jeho účet. */
  canEditAlloc: (person: PersonWithWeeks) => boolean;
}

const STICKY_HEAD: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  background: '#161b27',
  zIndex: 2,
};

function SummaryHeader({
  grand,
  planned,
  budget,
  allocError,
  role,
  onAddPerson,
}: {
  grand: number;
  planned: number;
  budget: number;
  allocError: string | null;
  role: MemberRole | null;
  onAddPerson: () => void;
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
      <div>
        <div
          style={{
            fontSize: 10,
            color: '#64748b',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Alokace po týdnech (%)
        </div>
        <div style={{ fontSize: 10, color: '#334155', marginTop: 2 }}>
          Edituj jméno, roli a % → MD se přepočítají živě
        </div>
        {allocError && (
          <div style={{ fontSize: 10, color: '#f87171', marginTop: 4 }}>{allocError}</div>
        )}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
        {/*
          Trojice, ne dvojice. Porovnání kapacity s rozpočtem odpovídalo na
          „má tým víc lidí, než rozpočet platí"; otázka PM je „vejde se
          naplánovaná práce do rozpočtu". Barvu proto řídí `planned`, kapacita
          zůstává jako kontext — bez ní není poznat, jestli se to dá stihnout.
        */}
        <div style={{ fontSize: 14, fontWeight: 700, color: budgetColor(planned, budget) }}>
          Rozpočet: {budget} MD | Naplánováno: {planned} MD | Kapacita: {grand} MD
        </div>
        <PermissionGate role={role} require="pm">
          <button
            type="button"
            className="btn"
            onClick={onAddPerson}
            style={{
              padding: '4px 12px',
              background: '#0d2210',
              borderColor: '#34d39944',
              color: '#6ee7b7',
              fontSize: 10,
            }}
          >
            + Přidat člena
          </button>
        </PermissionGate>
      </div>
    </div>
  );
}

function TableHead({ weeks, monthGroups }: { weeks: Week[]; monthGroups: MonthGroup[] }) {
  const totalHead: React.CSSProperties = {
    padding: '6px 10px',
    textAlign: 'right',
    fontWeight: 600,
    background: '#161b27',
  };
  return (
    <thead>
      <tr>
        <th style={{ padding: 0, ...STICKY_HEAD }} />
        {monthGroups.map((mg) => (
          <th
            key={mg.mIdx}
            colSpan={mg.weeks}
            style={{
              background: `${mg.color}33`,
              color: '#94a3b8',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.1em',
              padding: '2px 0',
            }}
          >
            {mg.label.toUpperCase()}
          </th>
        ))}
        <th colSpan={4} style={{ background: '#161b27' }} />
      </tr>
      <tr style={{ borderBottom: '1px solid #1e2533' }}>
        <th
          style={{
            padding: '8px 14px',
            textAlign: 'left',
            color: '#475569',
            fontWeight: 500,
            minWidth: 160,
            ...STICKY_HEAD,
          }}
        >
          Člen / Role
        </th>
        {weeks.map((w, wi) => (
          <th
            key={w.w}
            data-week-index={wi}
            style={{
              padding: '6px 6px',
              textAlign: 'center',
              color: w.dl ? '#fca5a5' : '#475569',
              fontWeight: 400,
              minWidth: 62,
              background: '#161b27',
            }}
          >
            <div style={{ fontSize: 9 }}>{w.label}</div>
            {w.dl && <div style={{ fontSize: 8, color: '#f87171', fontWeight: 700 }}>⚑{w.dl}</div>}
            <div style={{ fontSize: 8, color: '#334155' }}>{w.workdays}d</div>
          </th>
        ))}
        <th style={{ ...totalHead, color: '#4f9cf9', minWidth: 70 }}>CELKEM</th>
        <th style={{ ...totalHead, color: '#f59e0b', minWidth: 70 }}>PŘIŘAZ.</th>
        <th style={{ ...totalHead, color: '#475569', minWidth: 50 }}>∆</th>
        <th style={{ padding: '6px 10px', background: '#161b27', minWidth: 32 }} />
      </tr>
    </thead>
  );
}

function TotalsRow({
  weeks,
  weekTotals,
  grand,
  budget,
}: {
  weeks: Week[];
  weekTotals: number[];
  grand: number;
  budget: number;
}) {
  return (
    <tr style={{ background: '#161b27', borderTop: '2px solid #1e2533' }}>
      <td
        style={{
          padding: '8px 14px',
          color: '#94a3b8',
          fontSize: 10,
          fontWeight: 600,
          position: 'sticky',
          left: 0,
          background: '#161b27',
          zIndex: 1,
        }}
      >
        TÝM / TÝDEN
      </td>
      {weekTotals.map((t, i) => (
        <td key={weeks[i]?.w ?? i} style={{ padding: '8px 6px', textAlign: 'center' }}>
          <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 11 }}>{t}</div>
          <div style={{ fontSize: 8, color: '#475569' }}>MD</div>
        </td>
      ))}
      <td
        style={{
          padding: '8px 10px',
          textAlign: 'right',
          fontWeight: 700,
          fontSize: 14,
          color: budgetColor(grand, budget),
        }}
      >
        {grand}
      </td>
      <td
        colSpan={3}
        style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, color: '#475569' }}
      >
        / {budget} MD budget
      </td>
    </tr>
  );
}

export function CapacityTable({
  people,
  weeks,
  monthGroups,
  roles,
  budget,
  role,
  totals,
  weeklyLoad,
  members,
  editing,
  canEditAlloc,
}: CapacityTableProps) {
  return (
    <div
      style={{
        border: '1px solid #1e2533',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 20,
      }}
    >
      <SummaryHeader
        grand={totals.grand}
        planned={totals.planned}
        budget={budget}
        allocError={editing.allocError}
        role={role}
        onAddPerson={editing.addPerson}
      />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 10, minWidth: 900 }}>
          <TableHead weeks={weeks} monthGroups={monthGroups} />
          <tbody>
            {people.map((person, pi) => (
              <CapacityRow
                key={person.id}
                person={person}
                rowIndex={pi}
                weeks={weeks}
                roles={roles}
                load={weeklyLoad.byPerson[person.id]}
                role={role}
                demand={totals.personDemand[person.id] || 0}
                editable={canEditAlloc(person)}
                members={members}
                editing={editing}
              />
            ))}
            <TotalsRow
              weeks={weeks}
              weekTotals={totals.weekTotals}
              grand={totals.grand}
              budget={budget}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}
