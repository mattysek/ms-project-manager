// ADO Sync (PRD-06). Po ADR-008 tenhle view **nesahá na Azure DevOps ani na
// PAT** — všechno jde přes commandy (`useAdoSync`) a zpátky jako diffy:
//
//   klik ──command──> ProjectActor ──> ADOBridge ──> Azure DevOps
//        <──diff/výsledek───────────────────────────┘
//
// Na klientovi zůstává jen prezentace: vykreslení změn, merge editor popisu,
// výběr strany a formuláře. Detekce změn, snapshot, konverze HTML↔markdown i
// mapování identit se počítají na serveru — kdyby si je klient počítal sám,
// rozešel by se s tím, podle čeho server porovnává, a hlásil by falešné změny.
//
// Sekce konfigurace je pro Dev **skrytá**, ne jen disablovaná (FR-ROLE-04
// výjimka) — údaje o PATu se mu nesmí objevit ani v DOMu.
import { useEffect } from 'react';
import type { ADOConfig, ADOSyncLogEntry, Categories, Person, Task } from '../../types';
import type { MemberRole } from '../../types/protocol';
import type { UseAdoSyncResult } from '../../hooks/useAdoSync';
import { PermissionGate } from '../PermissionGate';
import { ChangesSection } from './ado/ChangesSection';
import { ConfigPanel } from './ado/ConfigPanel';
import { CoverageGapSection } from './ado/CoverageGapSection';
import { SyncBar } from './ado/SyncBar';
import { SyncLogPanel } from './ado/SyncLogPanel';
import type { GapContext } from './ado/types';
import { UnlinkedTasksSection } from './ado/UnlinkedTasksSection';

export interface AdoSyncViewProps {
  /** Stavová a command vrstva ADO — jediná cesta k serveru (ADR-008). */
  ado: UseAdoSyncResult;
  adoConfig: ADOConfig | null;
  adoSyncLog: ADOSyncLogEntry[];
  tasks: Task[];
  people: Person[];
  cats: Categories;
  numWeeks: number;
  /** Role na projektu — konfigurace i sync jsou PM-only (PRD-03, FR-ROLE-04). */
  role: MemberRole | null;
  /** FR-OFFLINE-07: sync vyžaduje připojení k serveru (a přes něj k ADO). */
  isOffline?: boolean;
}

export function AdoSyncView({
  ado,
  adoConfig,
  adoSyncLog,
  tasks,
  people,
  cats,
  numWeeks,
  role,
  isOffline = false,
}: AdoSyncViewProps) {
  const gapCtx: GapContext | null = adoConfig
    ? { people, cats, tasks, numWeeks, config: adoConfig }
    : null;

  // Stav PATu není v `AppState` (je per-user), takže po reloadu ani po
  // reconnectu o něm klient neví nic a tvrdil by „PAT není nastaven" —
  // včetně zakázaného tlačítka synchronizace. Ptáme se tedy sami, při každém
  // vstupu na záložku a po návratu online; command je PM-only (FR-ROLE-04).
  const { requestStatus } = ado.commands;
  useEffect(() => {
    if (isOffline || role !== 'pm') return;
    requestStatus();
  }, [isOffline, role, requestStatus]);

  return (
    <div style={{ padding: '20px 28px' }}>
      <PermissionGate role={role} require="pm" hide>
        <ConfigPanel config={adoConfig} people={people} ado={ado} />
      </PermissionGate>
      <SyncBar
        ado={ado}
        role={role}
        isOffline={isOffline}
        patSet={ado.patStatus.patSet}
        configured={Boolean(adoConfig?.orgUrl)}
      />
      <ChangesSection ado={ado} tasks={tasks} config={adoConfig} />
      <CoverageGapSection ado={ado} ctx={gapCtx} />
      <UnlinkedTasksSection tasks={tasks} config={adoConfig} role={role} ado={ado} />
      <SyncLogPanel entries={adoSyncLog} role={role} />
    </div>
  );
}
