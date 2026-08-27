// `/admin/users` — správa uživatelských účtů (FR-AUTH-05).
import { useState } from 'react';
import type { UserSummary } from '../../api/adminApi';
import { AppStyles } from '../AppStyles';
import { useAdminUsers } from './useAdminUsers';
import { UserRow } from './UserRow';
import { CreateUserDialog } from './CreateUserDialog';
import { ResetPasswordDialog } from './ResetPasswordDialog';

interface AdminUsersPageProps {
  onBack: () => void;
}

const COLUMNS = ['Jméno', 'Uživatelské jméno', 'Role', 'Stav', ''];

export function AdminUsersPage({ onBack }: AdminUsersPageProps) {
  const admin = useAdminUsers();
  const { users, loading, createUser, toggleActive, resetPassword } = admin;
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);

  const handleToggle = (user: UserSummary) => {
    if (user.isActive && !confirm(`Opravdu deaktivovat uživatele ${user.displayName}?`)) return;
    toggleActive(user);
  };

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono','Courier New',monospace",
        background: '#0f1117',
        minHeight: '100vh',
        color: '#e2e8f0',
        padding: '32px 28px',
      }}
    >
      <AppStyles />
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <Toolbar onBack={onBack} onCreate={() => setShowCreate(true)} />

        <Banners
          message={admin.message}
          warning={admin.warning}
          onDismissWarning={admin.dismissWarning}
          error={admin.error}
          onDismissError={admin.dismissError}
        />

        {loading ? (
          <div style={{ color: '#475569' }}>Načítám…</div>
        ) : (
          <UsersTable
            users={users}
            onToggleActive={handleToggle}
            onResetPassword={setResetTarget}
          />
        )}
      </div>

      {showCreate && (
        <CreateUserDialog onCreate={createUser} onClose={() => setShowCreate(false)} />
      )}
      {resetTarget && (
        <ResetPasswordDialog
          displayName={resetTarget.displayName}
          onReset={(password) => resetPassword(resetTarget.id, password)}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}

const BANNER: React.CSSProperties = {
  borderRadius: 6,
  padding: '8px 14px',
  marginBottom: 14,
  fontSize: 11,
};

/** Potvrzení akce a odmítnutí serverem — dvě nezávislá hlášení nad tabulkou. */
function Banners({
  message,
  warning,
  onDismissWarning,
  error,
  onDismissError,
}: {
  message: string | null;
  warning: string | null;
  onDismissWarning: () => void;
  error: string | null;
  onDismissError: () => void;
}) {
  return (
    <>
      {message && (
        <div
          style={{
            ...BANNER,
            background: '#0d2210',
            border: '1px solid #34d39955',
            color: '#6ee7b7',
          }}
        >
          {message}
        </div>
      )}
      {warning && (
        <DismissibleBanner
          text={warning}
          onDismiss={onDismissWarning}
          background="#241a08"
          border="#f59e0b55"
          color="#fcd34d"
          label="Zavřít upozornění"
        />
      )}
      {error && (
        <DismissibleBanner
          text={error}
          onDismiss={onDismissError}
          background="#2a1010"
          border="#f8717155"
          color="#fca5a5"
          label="Zavřít chybu"
        />
      )}
    </>
  );
}

/** Pruh s křížkem — sdílený upozorněním i chybou, ať se nekopíruje stejné JSX. */
function DismissibleBanner({
  text,
  onDismiss,
  background,
  border,
  color,
  label,
}: {
  text: string;
  onDismiss: () => void;
  background: string;
  border: string;
  color: string;
  label: string;
}) {
  return (
    <div
      role="alert"
      style={{
        ...BANNER,
        background,
        border: `1px solid ${border}`,
        color,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <span>{text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={label}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
      >
        ✕
      </button>
    </div>
  );
}

function Toolbar({ onBack, onCreate }: { onBack: () => void; onCreate: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <button
        type="button"
        onClick={onBack}
        className="btn"
        style={{ background: 'transparent', borderColor: '#2d3748', color: '#64748b' }}
      >
        ← Zpět
      </button>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Správa uživatelů</div>
      <button
        type="button"
        onClick={onCreate}
        className="btn"
        style={{
          marginLeft: 'auto',
          background: '#0d2210',
          borderColor: '#34d39966',
          color: '#6ee7b7',
        }}
      >
        Přidat uživatele
      </button>
    </div>
  );
}

function UsersTable({
  users,
  onToggleActive,
  onResetPassword,
}: {
  users: UserSummary[];
  onToggleActive: (user: UserSummary) => void;
  onResetPassword: (user: UserSummary) => void;
}) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 11,
        border: '1px solid #1e2533',
        borderRadius: 8,
      }}
    >
      <thead>
        <tr style={{ background: '#161b27', borderBottom: '1px solid #1e2533' }}>
          {COLUMNS.map((c) => (
            <th
              key={c}
              style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 500 }}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            onToggleActive={onToggleActive}
            onResetPassword={onResetPassword}
          />
        ))}
      </tbody>
    </table>
  );
}
