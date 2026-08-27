// Indikátor stavu spojení v hlavičce — nahrazuje bývalý „Uloženo HH:MM"
// indikátor z `useAutoSave` (ta persistence teď běží na serveru, ADR-005).
// FR-OFFLINE-02: „Header zobrazí ikonu signálu ⚡ Offline místo indikátoru
// posledního uložení."
import type { ChannelConnectionStatus } from '../hooks/useProjectChannel';

const STATUS_CFG: Record<ChannelConnectionStatus, { label: string; color: string }> = {
  connected: { label: 'Online', color: '#34d399' },
  connecting: { label: 'Připojuji…', color: '#fbbf24' },
  reconnecting: { label: '⚡ Offline', color: '#f87171' },
  disconnected: { label: '⚡ Offline', color: '#f87171' },
};

export function HeaderConnectionStatus({
  connectionStatus,
}: {
  connectionStatus: ChannelConnectionStatus;
}) {
  const cfg = STATUS_CFG[connectionStatus];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10,
        color: '#475569',
        padding: '4px 8px',
        background: '#0c1018',
        border: '1px solid #1e2533',
        borderRadius: 4,
      }}
    >
      <span style={{ color: cfg.color }}>●</span>
      <span>{cfg.label}</span>
    </div>
  );
}
