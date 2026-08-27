// Offline banner — FR-OFFLINE-02, FR-COLLAB-07 (diskrétní kolab. notifikace),
// FR-OFFLINE-05 (zpráva o synchronizaci), FR-OFFLINE-08 (zpráva o expiraci).
//
// Čtyři nezávislé, vzájemně se nevylučující stavy se skládají shora dolů —
// offline banner MÁ přednost (je nejnaléhavější a nezmizí sám), ostatní jsou
// dismissable toasty. Držíme je v jedné komponentě, protože všechny plynou ze
// stejného `useProjectSession` a vizuálně patří do stejného pruhu pod headerem.
import type { CSSProperties } from 'react';

interface OfflineBannerProps {
  isOffline: boolean;
  pendingCount: number;
  syncMessage: string | null;
  purgedNotice: number | null;
  queueFullWarning: string | null;
  collabNotice: string | null;
  onDismissSyncMessage: () => void;
  onDismissPurgedNotice: () => void;
  onDismissQueueFullWarning: () => void;
  onDismissCollabNotice: () => void;
}

const barStyle = (bg: string, border: string, color: string): CSSProperties => ({
  padding: '8px 20px',
  background: bg,
  borderBottom: `1px solid ${border}`,
  color,
  fontSize: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
});

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: 13,
        opacity: 0.7,
      }}
      aria-label="Zavřít"
    >
      ✕
    </button>
  );
}

function pendingLabel(count: number): string {
  if (count === 0) return '';
  if (count === 1) return ' — 1 čekající změna';
  if (count >= 2 && count <= 4) return ` — ${count} čekající změny`;
  return ` — ${count} čekajících změn`;
}

export function OfflineBanner({
  isOffline,
  pendingCount,
  syncMessage,
  purgedNotice,
  queueFullWarning,
  collabNotice,
  onDismissSyncMessage,
  onDismissPurgedNotice,
  onDismissQueueFullWarning,
  onDismissCollabNotice,
}: OfflineBannerProps) {
  return (
    <>
      {isOffline && (
        <div style={barStyle('#2a2010', '#f59e0b55', '#fcd34d')} role="status">
          <span>
            ⚠ Offline — pracujete bez připojení. Změny budou uloženy při obnovení spojení.
            {pendingLabel(pendingCount)}
          </span>
        </div>
      )}
      {syncMessage && (
        <div style={barStyle('#0d2a1a', '#34d39955', '#6ee7b7')} role="status">
          <span>{syncMessage}</span>
          <DismissButton onClick={onDismissSyncMessage} />
        </div>
      )}
      {purgedNotice !== null && (
        <div style={barStyle('#1a2a2a', '#38bdf855', '#7dd3fc')} role="status">
          <span>
            {purgedNotice === 1
              ? '1 starý čekající změna byla odstraněna (starší než 48 hodin)'
              : `${purgedNotice} starých čekajících změn bylo odstraněno (starší než 48 hodin)`}
          </span>
          <DismissButton onClick={onDismissPurgedNotice} />
        </div>
      )}
      {queueFullWarning && (
        <div style={barStyle('#2a1010', '#f8717155', '#fca5a5')} role="alert">
          <span>{queueFullWarning}</span>
          <DismissButton onClick={onDismissQueueFullWarning} />
        </div>
      )}
      {collabNotice && (
        <div style={barStyle('#161b27', '#4f9cf944', '#93c5fd')} role="status">
          <span>{collabNotice}</span>
          <DismissButton onClick={onDismissCollabNotice} />
        </div>
      )}
    </>
  );
}
