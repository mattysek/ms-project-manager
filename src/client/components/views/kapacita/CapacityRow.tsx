// Jeden řádek tabulky kapacit — jmenovka, alokace po týdnech a součty.
import type { PersonWithWeeks, Roles, Week } from '../../../types';
import type { Member } from '../../../api/membersApi';
import type { MemberRole } from '../../../types/protocol';
import { personTotalMD, weekMD } from '../../../utils';
import { PermissionGate } from '../../PermissionGate';
import { allocColor, diffColor } from './colors';
import type { PeopleEditing } from './usePeopleEditing';
import type { WeekLoad } from './useWeeklyLoad';

interface CapacityRowProps {
  person: PersonWithWeeks;
  rowIndex: number;
  weeks: Week[];
  roles: Roles;
  role: MemberRole | null;
  /** Přiřazená práce v MD — počítá se z úkolů, ne z alokace. */
  demand: number;
  /** Smí přihlášený uživatel měnit alokaci tohohle řádku? (ADR-006) */
  editable: boolean;
  /** Zatížení osoby po týdnech — barví buňky přetížených týdnů. */
  load: WeekLoad[] | undefined;
  /** Členové projektu — nabídka pro přiřazení účtu k osobě (FR-ROLE-07). */
  members: Member[];
  editing: PeopleEditing;
}

/**
 * Přiřazení osoby k uživatelskému účtu (FR-ROLE-07).
 *
 * Bez téhle volby byla role Dev fakticky read-only: „vlastní" znamená
 * `person.userId = ctx.userId` (ADR-006), a osobu nešlo k účtu přiřadit nikde.
 * Nabízejí se **členové projektu**, ne všichni uživatelé — přiřadit účet, který
 * do projektu nesmí, nedává smysl.
 *
 * Dev vidí jen text: kdo je kdo je užitečná informace, měnit ji smí PM.
 */
function AccountCell({
  person,
  role,
  members,
  editing,
}: Pick<CapacityRowProps, 'person' | 'role' | 'members' | 'editing'>) {
  const linked = members.find((member) => member.userId === person.userId);

  if (role !== 'pm') {
    return (
      <div style={{ fontSize: 9, color: '#475569', marginTop: 3 }}>
        {linked ? `👤 ${linked.displayName}` : '👤 bez účtu'}
      </div>
    );
  }

  return (
    <select
      className="inp"
      value={person.userId ?? ''}
      onChange={(e) => {
        const picked = members.find((member) => member.userId === e.target.value);
        editing.updateAccount(person.id, picked?.userId ?? null, picked?.displayName);
      }}
      aria-label={`Účet — ${person.name}`}
      style={{ width: '100%', marginTop: 3, color: '#64748b', cursor: 'pointer', fontSize: 9 }}
    >
      <option value="">— bez účtu —</option>
      {/* Osoba přiřazená účtu, který mezitím přestal být členem, by jinak
          tiše spadla na „bez účtu" a select by lhal o skutečné hodnotě. */}
      {person.userId && !linked && <option value={person.userId}>— neznámý účet —</option>}
      {members.map((member) => (
        <option key={member.userId} value={member.userId}>
          {member.displayName}
        </option>
      ))}
    </select>
  );
}

function IdentityCell({
  person,
  roles,
  role,
  bg,
  members,
  editing,
}: Pick<CapacityRowProps, 'person' | 'roles' | 'role' | 'members' | 'editing'> & { bg: string }) {
  return (
    <td
      style={{
        padding: '4px 8px',
        position: 'sticky',
        left: 0,
        background: bg,
        zIndex: 1,
        minWidth: 160,
      }}
    >
      <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
        <PermissionGate role={role} require="pm" readOnly>
          <input
            className="inp"
            value={person.name}
            onChange={(e) => editing.updatePerson(person.id, 'name', e.target.value)}
            aria-label={`Jméno — ${person.name}`}
            style={{ flex: 1, color: person.color, fontWeight: 700 }}
          />
        </PermissionGate>
        <PermissionGate role={role} require="pm">
          <input
            type="color"
            value={person.color}
            onChange={(e) => editing.updatePerson(person.id, 'color', e.target.value)}
            aria-label={`Barva — ${person.name}`}
            style={{ width: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
          />
        </PermissionGate>
      </div>
      <PermissionGate role={role} require="pm">
        <select
          className="inp"
          value={person.role}
          onChange={(e) => editing.updatePerson(person.id, 'role', e.target.value)}
          aria-label={`Role — ${person.name}`}
          style={{ width: '100%', color: '#94a3b8', cursor: 'pointer' }}
        >
          {/* Osoba po smazání role (viz `deleteRole`) nemá roli v `roles` —
              bez prázdné volby by prohlížeč tiše vybral první option a select
              by lhal o skutečné (prázdné) hodnotě. */}
          {!roles[person.role] && <option value={person.role}>— bez role —</option>}
          {Object.entries(roles).map(([k, r]) => (
            <option key={k} value={k}>
              {r.label}
            </option>
          ))}
        </select>
      </PermissionGate>
      <AccountCell person={person} role={role} members={members} editing={editing} />
    </td>
  );
}

/**
 * Barva a popis zatížení buňky. `null` znamená „nic zvláštního" — buňku
 * netónujeme, ať přetížení vyskočí a nesplyne s běžnými týdny.
 */
function loadStatus(load: WeekLoad | undefined, alloc: number) {
  if (!load || alloc === 0) return null;
  const over = Math.round((load.demand - load.capacity) * 10) / 10;
  if (over > 0) {
    return {
      background: '#2a0a0a',
      title: `Kapacita ${load.capacity} MD, přiřazeno ${load.demand} MD — přetíženo o ${over} MD`,
      label: 'přetíženo',
    };
  }
  if (load.demand === 0) {
    return {
      background: '#0a1420',
      title: `Kapacita ${load.capacity} MD, nepřiřazeno nic`,
      label: 'nevyužito',
    };
  }
  return null;
}

function AllocCell({
  person,
  weekIdx,
  alloc,
  editable,
  load,
  onChange,
}: {
  person: PersonWithWeeks;
  weekIdx: number;
  alloc: number;
  editable: boolean;
  load: WeekLoad | undefined;
  onChange: (value: string) => void;
}) {
  const isOff = alloc === 0;
  const status = loadStatus(load, alloc);
  return (
    <td
      style={{ padding: '3px 3px', textAlign: 'center', background: status?.background }}
      title={status?.title}
      data-load={status?.label}
    >
      <input
        type="number"
        min="0"
        max="100"
        step="5"
        value={alloc}
        className="inp"
        readOnly={!editable}
        title={editable ? undefined : 'Dev může editovat pouze vlastní alokaci'}
        aria-label={`Alokace W${weekIdx + 1} — ${person.name}`}
        onChange={(e) => editable && onChange(e.target.value)}
        style={{
          width: 52,
          textAlign: 'center',
          color: allocColor(isOff, alloc, person.color),
          fontWeight: isOff ? 400 : 600,
          background: isOff ? '#0a0e14' : '#0c1018',
        }}
      />
      <div style={{ fontSize: 8, color: isOff ? '#1e2533' : '#334155', marginTop: 1 }}>
        {isOff ? '–' : `${weekMD(person, weekIdx)}MD`}
      </div>
    </td>
  );
}

export function CapacityRow({
  person,
  rowIndex,
  weeks,
  roles,
  role,
  demand,
  editable,
  load,
  members,
  editing,
}: CapacityRowProps) {
  const tot = personTotalMD(person);
  const diff = Math.round((demand - tot) * 10) / 10;
  const bg = rowIndex % 2 === 0 ? '#0c1018' : '#0e1320';
  const numCell: React.CSSProperties = { padding: '6px 10px', textAlign: 'right' };

  return (
    <tr style={{ borderBottom: '1px solid #1e253366', background: bg }}>
      <IdentityCell
        person={person}
        roles={roles}
        role={role}
        bg={bg}
        members={members}
        editing={editing}
      />
      {person.weekAlloc.map((a, wi) => (
        <AllocCell
          key={weeks[wi]?.w ?? wi}
          person={person}
          weekIdx={wi}
          alloc={a}
          editable={editable}
          load={load?.[wi]}
          onChange={(value) => editing.updateAlloc(person.id, wi, value)}
        />
      ))}
      <td style={{ ...numCell, fontWeight: 700, color: person.color }}>{tot}</td>
      <td style={{ ...numCell, color: '#94a3b8' }}>{demand}</td>
      <td style={{ ...numCell, fontWeight: 600, color: diffColor(diff) }}>
        {diff > 0 ? '+' : ''}
        {diff}
      </td>
      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
        <PermissionGate role={role} require="pm">
          <button
            type="button"
            onClick={() => editing.removePerson(person.id)}
            aria-label={`Odebrat — ${person.name}`}
            style={{
              background: 'none',
              border: 'none',
              color: '#475569',
              cursor: 'pointer',
              fontSize: 13,
              padding: '2px 4px',
              borderRadius: 3,
              transition: 'color .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
          >
            ✕
          </button>
        </PermissionGate>
      </td>
    </tr>
  );
}
