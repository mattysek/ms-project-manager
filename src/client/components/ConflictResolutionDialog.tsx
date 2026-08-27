// Conflict resolution dialog — FR-OFFLINE-06, offline.feature scénáře
// „Conflict resolution dialog při reconnectu" a navazující.
//
// Zobrazí se, jakmile `useProjectSession().conflicts` není prázdné pole —
// `App.tsx` ho renderuje podmíněně, žádný vlastní `isOpen` prop není potřeba.
import type { Conflict } from '../state/detectConflicts';
import { LAYERS } from '../constants/layers';

interface ConflictResolutionDialogProps {
  conflicts: Conflict[];
  onResolve: (conflict: Conflict, resolution: 'server' | 'mine') => void;
  onResolveAll: (resolution: 'server' | 'mine') => void;
}

function ConflictRow({
  conflict,
  onResolve,
}: {
  conflict: Conflict;
  onResolve: (resolution: 'server' | 'mine') => void;
}) {
  return (
    <div
      style={{
        background: '#0c1018',
        border: '1px solid #1e2533',
        borderRadius: 8,
        padding: 14,
        marginBottom: 10,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>
        {conflict.entityLabel}
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>{conflict.fieldLabel}</div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, marginBottom: 10 }}>
        <span style={{ color: '#94a3b8' }}>
          Server má: <strong style={{ color: '#f1f5f9' }}>{String(conflict.serverValue)}</strong>
        </span>
        <span style={{ color: '#94a3b8' }}>
          Vaše změna: <strong style={{ color: '#f1f5f9' }}>{String(conflict.pendingValue)}</strong>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={() => onResolve('server')}
          style={{ background: '#161b27', borderColor: '#2d3748', color: '#94a3b8' }}
        >
          Ponechat serverovou
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onResolve('mine')}
          style={{ background: '#0d2a1a', borderColor: '#34d39966', color: '#6ee7b7' }}
        >
          Použít moji
        </button>
      </div>
    </div>
  );
}

export function ConflictResolutionDialog({
  conflicts,
  onResolve,
  onResolveAll,
}: ConflictResolutionDialogProps) {
  if (conflicts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: LAYERS.modal,
      }}
    >
      <div
        style={{
          background: '#161b27',
          border: '1px solid #f59e0b55',
          borderRadius: 10,
          padding: 24,
          maxWidth: 520,
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fcd34d', marginBottom: 4 }}>
          Conflict Resolution — {conflicts.length}{' '}
          {conflicts.length === 1 ? 'konflikt' : 'konflikty'}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 16 }}>
          Zatímco jste byli offline, tahle pole změnil někdo jiný. Vyberte, kterou verzi ponechat.
        </div>

        {conflicts.map((c) => (
          <ConflictRow
            key={`${c.pending.id}-${c.entityId}-${c.fieldLabel}`}
            conflict={c}
            onResolve={(resolution) => onResolve(c, resolution)}
          />
        ))}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            type="button"
            className="btn"
            onClick={() => onResolveAll('server')}
            style={{ background: '#161b27', borderColor: '#2d3748', color: '#94a3b8' }}
          >
            Ponechat vše serverové
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onResolveAll('mine')}
            style={{ background: '#0d2a1a', borderColor: '#34d39966', color: '#6ee7b7' }}
          >
            Použít vše moje
          </button>
        </div>
      </div>
    </div>
  );
}
