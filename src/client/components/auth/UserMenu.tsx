// Uživatel v hlavičce — jméno, role na aktuálním projektu, dropdown se
// „Změna hesla" a „Odhlásit" (FR-AUTH-02, FR-AUTH-06, FR-ROLE-05).
import { useState } from 'react';
import type { CurrentUser } from '../../api/authApi';
import type { MemberRole } from '../../types/protocol';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { LAYERS } from '../../constants/layers';

const ROLE_LABEL: Record<MemberRole, string> = { pm: 'PM', dev: 'Dev' };

interface UserMenuProps {
  user: CurrentUser;
  /** Role na aktuálně otevřeném projektu; `null` mimo projekt (LandingPage). */
  role: MemberRole | null;
  onLogout: () => void;
  onOpenAdmin: () => void;
}

export function UserMenu({ user, role, onLogout, onOpenAdmin }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // Vlastní popisek: stejné jméno se objevuje i v seznamu členů
        // projektu, takže samotný text tlačítko jednoznačně neurčuje.
        aria-label={`Uživatelské menu — ${user.displayName}`}
        aria-expanded={open}
        className="btn"
        style={{
          background: '#161b27',
          borderColor: '#2d3748',
          color: '#e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {user.displayName}
        {role && <span style={{ color: '#4f9cf9', fontWeight: 700 }}>[{ROLE_LABEL[role]}]</span>}
      </button>
      {open && (
        <>
          {/* Neviditelná vrstva pro zavření menu kliknutím mimo — čistě myší
              gesto, položky menu i přepínací tlačítko zůstávají plně ovladatelné
              klávesnicí (Tab), zavření samotné klávesnici nic neubírá. */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: vrstva pro zavření kliknutím mimo, ne interaktivní prvek */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: vrstva pro zavření kliknutím mimo, ne interaktivní prvek */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: LAYERS.topBar - 1 }}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: '#0c1018',
              border: '1px solid #1e2533',
              borderRadius: 8,
              minWidth: 170,
              zIndex: LAYERS.topBar + 1,
              overflow: 'hidden',
            }}
          >
            {user.isAdmin && (
              <MenuItem
                label="Správa uživatelů"
                onClick={() => {
                  setOpen(false);
                  onOpenAdmin();
                }}
              />
            )}
            <MenuItem
              label="Změna hesla"
              onClick={() => {
                setOpen(false);
                setShowChangePassword(true);
              }}
            />
            <MenuItem
              label="Odhlásit"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            />
          </div>
        </>
      )}
      {showChangePassword && <ChangePasswordDialog onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '9px 14px',
        background: 'transparent',
        border: 'none',
        color: '#94a3b8',
        fontSize: 11,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#161b27')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  );
}
