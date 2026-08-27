// Rozbalovací správa rolí nad tabulkou kapacit.
import type { PersonWithWeeks, Roles } from '../../../types';
import type { RoleManagerState } from './useRoleManager';

interface RoleManagerProps {
  roles: Roles;
  people: PersonWithWeeks[];
  state: RoleManagerState;
}

function ToggleHeader({
  roleCount,
  expanded,
  onToggle,
}: {
  roleCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: '100%',
        border: 'none',
        font: 'inherit',
        textAlign: 'left',
        background: '#161b27',
        padding: '8px 14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: '#64748b',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        Správa rolí
      </span>
      <span style={{ fontSize: 9, color: '#475569' }}>({roleCount} rolí)</span>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>
        {expanded ? '▲' : '▼'}
      </span>
    </button>
  );
}

function RoleRow({
  roleKey,
  label,
  peopleCount,
  isLastRole,
  onRename,
  onDelete,
}: {
  roleKey: string;
  label: string;
  peopleCount: number;
  /** Poslední roli nelze smazat — osoby by zůstaly bez jakékoli volby. */
  isLastRole: boolean;
  onRename: (label: string) => void;
  onDelete: () => void;
}) {
  const idleColor = isLastRole ? '#334155' : '#475569';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: '#161b27',
        border: '1px solid #2d374833',
        borderRadius: 6,
      }}
    >
      <span style={{ fontSize: 10, color: '#4f9cf9', fontWeight: 700, minWidth: 36 }}>
        {roleKey}
      </span>
      <input
        className="inp"
        value={label}
        onChange={(e) => onRename(e.target.value)}
        style={{ flex: 1, minWidth: 150, fontWeight: 500 }}
      />
      <span style={{ fontSize: 9, color: '#334155', minWidth: 50 }}>{peopleCount} osob</span>
      <button
        type="button"
        onClick={onDelete}
        disabled={isLastRole}
        style={{
          background: 'none',
          border: 'none',
          color: idleColor,
          cursor: isLastRole ? 'not-allowed' : 'pointer',
          fontSize: 13,
          padding: '2px 5px',
          borderRadius: 3,
          transition: 'color .15s',
        }}
        onMouseEnter={(e) => {
          if (!isLastRole) e.currentTarget.style.color = '#f87171';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = idleColor;
        }}
      >
        ✕
      </button>
    </div>
  );
}

function NewRoleForm({ roles, state }: { roles: Roles; state: RoleManagerState }) {
  const filled = !!state.newRoleKey.trim() && !!state.newRoleLabel.trim();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: '#0a1018',
        border: '1px dashed #2d3748',
        borderRadius: 6,
      }}
    >
      <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>Nová:</span>
      <input
        className="inp"
        value={state.newRoleKey}
        onChange={(e) => state.setNewRoleKey(e.target.value.toUpperCase().slice(0, 4))}
        placeholder="Zkr."
        style={{ width: 50, textAlign: 'center', fontWeight: 700 }}
      />
      <input
        className="inp"
        value={state.newRoleLabel}
        onChange={(e) => state.setNewRoleLabel(e.target.value)}
        placeholder="Název role…"
        onKeyDown={(e) => e.key === 'Enter' && state.addRole()}
        style={{ flex: 1 }}
      />
      <button
        type="button"
        className="btn"
        onClick={state.addRole}
        disabled={!filled || !!roles[state.newRoleKey.trim().toUpperCase()]}
        style={{
          padding: '3px 12px',
          background: filled ? '#0d2210' : '#161b27',
          borderColor: filled ? '#34d39944' : '#2d3748',
          color: filled ? '#6ee7b7' : '#475569',
          fontSize: 10,
          flexShrink: 0,
          cursor: filled ? 'pointer' : 'not-allowed',
        }}
      >
        + Přidat
      </button>
    </div>
  );
}

export function RoleManager({ roles, people, state }: RoleManagerProps) {
  const roleKeys = Object.keys(roles);
  return (
    <div
      style={{
        border: '1px solid #1e2533',
        borderRadius: 8,
        marginBottom: 20,
        overflow: 'hidden',
      }}
    >
      <ToggleHeader
        roleCount={roleKeys.length}
        expanded={state.showRoleMgr}
        onToggle={state.toggleRoleMgr}
      />
      {state.showRoleMgr && (
        <div style={{ padding: '12px 14px', background: '#0c1018' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {Object.entries(roles).map(([key, role]) => (
              <RoleRow
                key={key}
                roleKey={key}
                label={role.label}
                peopleCount={people.filter((p) => p.role === key).length}
                isLastRole={roleKeys.length <= 1}
                onRename={(label) => state.updateRoleLabel(key, label)}
                onDelete={() => state.deleteRole(key)}
              />
            ))}
          </div>
          <NewRoleForm roles={roles} state={state} />
        </div>
      )}
    </div>
  );
}
