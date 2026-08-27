// Sync log (FR-ADO-10).
import { useState } from 'react';
import type { ADOSyncLogEntry } from '../../../types';
import type { MemberRole } from '../../../types/protocol';
import { PermissionGate } from '../../PermissionGate';
import { formatAdoDate, syncLogToCsv } from '../../../utils/adoLinks';
import { PANEL, PANEL_HEAD } from './styles';

/** Spustí stažení sync logu jako CSV souboru — bez round-tripu na server (data už jsou na klientovi). */
function downloadSyncLogCsv(entries: ADOSyncLogEntry[]): void {
  const blob = new Blob([syncLogToCsv(entries)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ado-sync-log_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SyncLogPanel({
  entries,
  role,
}: {
  entries: ADOSyncLogEntry[];
  role: MemberRole | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={PANEL}>
      {/* Nejde o <button> — hlavička obsahuje vnořené tlačítko „Export CSV" a HTML
          nepovoluje tlačítko v tlačítku. Skládací widget je proto vlastní role="button"
          s plnou klávesnicovou podporou (Enter/mezerník), ne jen kosmetický div. */}
      {/* biome-ignore lint/a11y/useSemanticElements: <button> nejde, obsahuje vnořené tlačítko Export CSV */}
      <div
        role="button"
        tabIndex={0}
        style={PANEL_HEAD}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11 }}>{expanded ? '▼' : '▶'}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#f1f5f9' }}>Sync log</span>
          <span style={{ fontSize: 10, color: '#64748b' }}>({entries.length})</span>
        </div>
        <PermissionGate role={role} require="pm">
          <button
            type="button"
            className="btn"
            onClick={(e) => {
              e.stopPropagation();
              downloadSyncLogCsv(entries);
            }}
            disabled={entries.length === 0}
            style={{ fontSize: 10, padding: '3px 10px' }}
          >
            ↓ Export CSV
          </button>
        </PermissionGate>
      </div>
      {expanded && (
        <div style={{ maxHeight: 300, overflow: 'auto', background: '#0c1018', padding: 8 }}>
          {entries.length === 0 ? (
            <div style={{ padding: 12, textAlign: 'center', color: '#475569', fontSize: 11 }}>
              Zatím žádné záznamy
            </div>
          ) : (
            entries.slice(0, 100).map((entry) => (
              <div
                key={entry.id}
                style={{
                  fontSize: 10,
                  padding: '4px 8px',
                  borderBottom: '1px solid #1e253344',
                  fontFamily: 'monospace',
                }}
              >
                <span style={{ color: '#64748b' }}>{formatAdoDate(entry.timestamp)}</span>{' '}
                <span style={{ color: '#a78bfa' }}>{entry.action}</span>{' '}
                {entry.wiId !== undefined && (
                  <span style={{ color: '#93c5fd' }}>WI #{entry.wiId} </span>
                )}
                <span style={{ color: '#e2e8f0' }}>{entry.details}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
