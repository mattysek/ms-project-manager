// Souhrny pod tabulkou — karta za osobu a kapacita po rolích.
import type { PersonWithWeeks, Roles } from '../../../types';
import { personTotalMD } from '../../../utils';
import { diffColor } from './colors';

function PersonCard({
  person,
  roles,
  demand,
}: {
  person: PersonWithWeeks;
  roles: Roles;
  demand: number;
}) {
  const tot = personTotalMD(person);
  const diff = Math.round((demand - tot) * 10) / 10;
  return (
    <div
      style={{
        background: '#161b27',
        border: `1px solid ${person.color}33`,
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 130,
        flex: '1 1 130px',
      }}
    >
      <div style={{ color: person.color, fontWeight: 700, fontSize: 11, marginBottom: 1 }}>
        {person.name}
      </div>
      <div style={{ color: '#475569', fontSize: 9, marginBottom: 6 }}>
        {roles[person.role]?.label || person.role}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
        {tot} <span style={{ fontSize: 10, color: '#475569' }}>MD</span>
      </div>
      <div style={{ fontSize: 9, color: diffColor(diff), marginTop: 2 }}>
        Přiřazeno: {demand} · ∆ {diff > 0 ? '+' : ''}
        {diff}
      </div>
    </div>
  );
}

export function PersonCards({
  people,
  roles,
  personDemand,
}: {
  people: PersonWithWeeks[];
  roles: Roles;
  personDemand: Record<string, number>;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
      {people.map((person) => (
        <PersonCard
          key={person.id}
          person={person}
          roles={roles}
          demand={personDemand[person.id] || 0}
        />
      ))}
    </div>
  );
}

export function RoleCapacity({
  roles,
  people,
  roleAvail,
}: {
  roles: Roles;
  people: PersonWithWeeks[];
  roleAvail: Record<string, number>;
}) {
  return (
    <div
      style={{
        background: '#161b27',
        border: '1px solid #1e2533',
        borderRadius: 8,
        padding: '12px 16px',
        fontSize: 10,
      }}
    >
      <div style={{ color: '#94a3b8', fontWeight: 600, marginBottom: 8, letterSpacing: '0.08em' }}>
        KAPACITA DLE ROLÍ
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {Object.entries(roles).map(([key, role]) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: '#64748b', fontSize: 9, letterSpacing: '0.08em' }}>
              {role.label}
            </span>
            <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16 }}>
              {roleAvail[key] || 0}{' '}
              <span style={{ fontSize: 10, fontWeight: 400, color: '#475569' }}>MD</span>
            </span>
            <span style={{ fontSize: 9, color: '#334155' }}>
              {people
                .filter((p) => p.role === key)
                .map((p) => p.name)
                .join(', ') || '–'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
