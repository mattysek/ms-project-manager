// Sekce „Členové projektu" v Project view — FR-ROLE-02, FR-ROLE-04.
//
// Pro Dev je to read-only přehled bez akčních prvků; oprávnění stejně vynucuje
// server (ADR-006), tohle je UX vrstva.
import { useState } from 'react';
import type { MemberRole } from '../../types/protocol';
import { MemberRow } from './MemberRow';
import { useProjectMembers } from './useProjectMembers';

interface ProjectMembersSectionProps {
  projectId: string;
  role: MemberRole | null;
  currentUserId: string | null;
}

const BOX_STYLE: React.CSSProperties = {
  border: '1px solid #1e2533',
  borderRadius: 8,
  marginBottom: 20,
  overflow: 'hidden',
};

const HEADER_STYLE: React.CSSProperties = {
  background: '#161b27',
  padding: '8px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 10,
  color: '#64748b',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 700,
};

const ROLE_LABEL: Record<MemberRole, string> = {
  pm: 'Project Manager (PM)',
  dev: 'Vývojář (Dev)',
};

export function ProjectMembersSection({
  projectId,
  role,
  currentUserId,
}: ProjectMembersSectionProps) {
  const isPm = role === 'pm';
  const members = useProjectMembers(projectId, true);
  const [selectedUser, setSelectedUser] = useState('');
  const [newRole, setNewRole] = useState<MemberRole>('dev');

  const handleAdd = async () => {
    if (!selectedUser) return;
    await members.addMember(selectedUser, newRole);
    setSelectedUser('');
  };

  return (
    <div style={BOX_STYLE}>
      <div style={HEADER_STYLE}>
        <span>Členové projektu</span>
        <span style={{ color: '#475569', textTransform: 'none', letterSpacing: 0 }}>
          ({members.members.length})
        </span>
      </div>

      {members.error && (
        <div
          role="alert"
          style={{ padding: '8px 14px', background: '#2a0a0a', color: '#f87171', fontSize: 11 }}
        >
          {members.error}
        </div>
      )}

      {members.loading ? (
        <div style={{ padding: '10px 14px', fontSize: 11, color: '#475569' }}>Načítám…</div>
      ) : (
        members.members.map((member) =>
          isPm ? (
            <MemberRow
              key={member.userId}
              member={member}
              isSelf={member.userId === currentUserId}
              onChangeRole={members.changeRole}
              onRemove={members.removeMember}
            />
          ) : (
            <div
              key={member.userId}
              style={{ display: 'flex', gap: 10, padding: '8px 14px', fontSize: 11 }}
            >
              <span style={{ flex: 1, color: '#e2e8f0' }}>{member.displayName}</span>
              <span style={{ color: '#64748b' }}>{ROLE_LABEL[member.role]}</span>
            </div>
          )
        )
      )}

      {isPm && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: '#0c1018' }}>
          <select
            className="inp"
            aria-label="Uživatel k přidání"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="">— vyberte uživatele —</option>
            {members.candidates.map((candidate) => (
              <option key={candidate.userId} value={candidate.userId}>
                {candidate.displayName}
              </option>
            ))}
          </select>
          <select
            className="inp"
            aria-label="Role nového člena"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as MemberRole)}
            style={{ width: 160 }}
          >
            <option value="dev">Vývojář (Dev)</option>
            <option value="pm">Project Manager (PM)</option>
          </select>
          <button className="btn" type="button" onClick={handleAdd} disabled={!selectedUser}>
            Přidat člena
          </button>
        </div>
      )}
    </div>
  );
}
