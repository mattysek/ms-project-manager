// Presence avatary v hlavičce — FR-COLLAB-04, real-time-collaboration.feature
// scénáře „Presence — zobrazení kdo je v projektu" a „Presence se aktualizuje
// při změně záložky".
//
// Vlastní vykreslení je jednoduché (max 5 avatarů + "+N"), ale je to nový kód
// v Header.tsx, takže dostává vlastní komponentu, aby zůstal pod limitem
// props/složitosti z ADR-012.
import { TABS } from '../constants';
import type { PresenceEntry } from '../types/protocol';

const MAX_VISIBLE = 5;

/** `view` je interní klíč (`gantt`, `seznam`, …) — tooltip chce lidský label ze `TABS`. */
function viewLabel(view: string): string {
  return TABS.find(([key]) => key === view)?.[1] ?? view;
}

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function Avatar({ user }: { user: PresenceEntry }) {
  return (
    <div
      title={`${user.displayName} — ${viewLabel(user.view)}`}
      style={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: user.color,
        color: '#0f1117',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        border: '2px solid #0f1117',
        marginLeft: -8,
      }}
    >
      {initials(user.displayName)}
    </div>
  );
}

export function PresenceAvatars({ users }: { users: PresenceEntry[] }) {
  if (users.length === 0) return null;
  const visible = users.slice(0, MAX_VISIBLE);
  const overflow = users.length - visible.length;

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 8, paddingLeft: 8 }}>
      {visible.map((u) => (
        <Avatar key={u.userId} user={u} />
      ))}
      {overflow > 0 && (
        <div
          title={`+${overflow} dalších`}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#334155',
            color: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            border: '2px solid #0f1117',
            marginLeft: -8,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
