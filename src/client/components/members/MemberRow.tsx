// Jeden řádek seznamu členů — změna role a odebrání (FR-ROLE-02).
import type { Member } from '../../api/membersApi';
import type { MemberRole } from '../../types/protocol';

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px',
  borderBottom: '1px solid #1e253344',
  fontSize: 11,
};

const SELF_REMOVE_TOOLTIP = 'Nejprve přiřaďte jiného Project Managera';

interface MemberRowProps {
  member: Member;
  /** Přihlášený uživatel nesmí odebrat sám sebe (FR-ROLE-02) — server to stejně vynutí. */
  isSelf: boolean;
  onChangeRole: (userId: string, role: MemberRole) => void;
  onRemove: (userId: string) => void;
}

export function MemberRow({ member, isSelf, onChangeRole, onRemove }: MemberRowProps) {
  const handleRemove = () => {
    if (!confirm(`Opravdu odebrat ${member.displayName} z projektu?`)) return;
    onRemove(member.userId);
  };

  return (
    <div style={ROW_STYLE}>
      <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 500 }}>
        {member.displayName}
        {isSelf && <span style={{ color: '#475569', fontSize: 9 }}> (vy)</span>}
      </span>
      <select
        className="inp"
        aria-label={`Změnit roli — ${member.displayName}`}
        value={member.role}
        onChange={(e) => onChangeRole(member.userId, e.target.value as MemberRole)}
        style={{ width: 160 }}
      >
        <option value="pm">Project Manager (PM)</option>
        <option value="dev">Vývojář (Dev)</option>
      </select>
      <button
        type="button"
        className="btn"
        aria-label={`Odebrat — ${member.displayName}`}
        onClick={handleRemove}
        disabled={isSelf}
        title={isSelf ? SELF_REMOVE_TOOLTIP : undefined}
        style={{
          background: '#2a0a0a',
          borderColor: '#f8717144',
          color: '#f87171',
          opacity: isSelf ? 0.5 : 1,
        }}
      >
        Odebrat
      </button>
    </div>
  );
}
