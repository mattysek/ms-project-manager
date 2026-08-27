// Lišta synchronizace (FR-ADO-04).
import type { UseAdoSyncResult } from '../../../hooks/useAdoSync';
import type { MemberRole } from '../../../types/protocol';
import { PermissionGate } from '../../PermissionGate';
import { formatAdoDate } from '../../../utils/adoLinks';
import { Badge } from './primitives';
import { BTN_BLUE, PANEL } from './styles';

interface SyncBarProps {
  ado: UseAdoSyncResult;
  role: MemberRole | null;
  isOffline: boolean;
  patSet: boolean;
  configured: boolean;
}

export function SyncBar({ ado, role, isOffline, patSet, configured }: SyncBarProps) {
  const { progress, syncing, result, lastLogEntry } = ado;
  const attention = ado.visibleChanges.length + ado.visibleGaps.length;

  return (
    <div
      style={{
        ...PANEL,
        background: '#161b27',
        padding: '12px 16px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {result && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            Poslední synchronizace: {formatAdoDate(result.lastSync)}
          </span>
        )}
        {result && !syncing && (
          <span style={{ fontSize: 11, color: '#6ee7b7' }}>
            Hotovo — {result.workItems.length} WI zkontrolováno
          </span>
        )}
        {attention > 0 && <Badge text={`${attention} položek vyžaduje pozornost`} tone="alert" />}
        {syncing && (
          <span role="status" style={{ fontSize: 11, color: '#93c5fd' }}>
            {progress ? formatProgress(progress) : 'Spouštím synchronizaci…'}
          </span>
        )}
        {lastLogEntry && !syncing && (
          <span style={{ fontSize: 10, color: '#64748b' }}>{lastLogEntry.details}</span>
        )}
      </div>
      <PermissionGate role={role} require="pm">
        <button
          type="button"
          className="btn"
          onClick={() => ado.commands.runSync()}
          disabled={syncing || !configured || !patSet || isOffline}
          title={isOffline ? 'Synchronizace s ADO vyžaduje připojení k internetu' : undefined}
          style={BTN_BLUE}
        >
          {syncing ? 'Synchronizuji…' : '▶ Synchronizovat'}
        </button>
      </PermissionGate>
    </div>
  );
}

/** „Stahuji work items… (42/87)" — fáze bez známého počtu jen s třemi tečkami. */
function formatProgress(progress: { phase: string; completed: number; total: number }): string {
  return progress.total > 0
    ? `${progress.phase}… (${progress.completed}/${progress.total})`
    : `${progress.phase}…`;
}
