// Jeden řádek v tabulce správy uživatelů (FR-AUTH-05).
import type { UserSummary } from '../../api/adminApi';

interface UserRowProps {
  user: UserSummary;
  onToggleActive: (user: UserSummary) => void;
  onResetPassword: (user: UserSummary) => void;
}

export function UserRow({ user, onToggleActive, onResetPassword }: UserRowProps) {
  return (
    <tr style={{ borderBottom: '1px solid #1e253366' }}>
      <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{user.displayName}</td>
      <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{user.userName}</td>
      <td style={{ padding: '8px 12px', color: user.isAdmin ? '#4f9cf9' : '#475569' }}>
        {user.isAdmin ? 'Admin' : '—'}
      </td>
      <td style={{ padding: '8px 12px' }}>
        <span
          style={{ color: user.isActive ? '#34d399' : '#f87171', fontSize: 10, fontWeight: 700 }}
        >
          {user.isActive ? 'Aktivní' : 'Deaktivován'}
        </span>
      </td>
      <td style={{ padding: '8px 12px', display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="btn"
          onClick={() => onToggleActive(user)}
          style={{
            background: user.isActive ? '#2a0a0a' : '#0d2210',
            borderColor: user.isActive ? '#f8717155' : '#34d39955',
            color: user.isActive ? '#f87171' : '#6ee7b7',
            fontSize: 10,
          }}
        >
          {user.isActive ? 'Deaktivovat' : 'Obnovit'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onResetPassword(user)}
          style={{ background: '#161b27', borderColor: '#2d3748', color: '#94a3b8', fontSize: 10 }}
        >
          Reset hesla
        </button>
      </td>
    </tr>
  );
}
