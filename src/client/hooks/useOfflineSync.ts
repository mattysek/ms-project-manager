// Reconnect replay + conflict resolution — ADR-009, PRD-05 (FR-OFFLINE-04/05/06/08).
//
// Kombinuje tři kusy, které už existují jako čisté funkce/moduly z předchozí
// dávky (`detectConflicts`, `offlineQueue`, `projectCache`) do jednoho
// orchestračního hooku — rozděleného na dvě menší poloviny (ADR-012 rozpočet
// na délku funkce), které `useOfflineSync` na konci souboru jen skládá:
//   1. `usePendingQueue` — počet čekajících commandů + zahození starých (FR-OFFLINE-08).
//   2. `useReconnectReplay` — zapamatuje si stav před odpojením, po dalším
//      `full_state` spočítá konflikty (`detectConflicts`), bezkonfliktní
//      commandy rovnou přehraje; konfliktní čekají na `resolveConflict`/
//      `resolveAllConflicts`.
import { useCallback, useEffect, useRef, useState } from 'react';
import { detectConflicts, type Conflict } from '../state/detectConflicts';
import {
  getPendingCommands,
  purgeExpiredCommands,
  removePendingCommand,
  type PendingCommand,
} from '../storage/offlineQueue';
import { getProjectCache } from '../storage/projectCache';
import { applyCommandOptimistically } from '../state/applyCommandOptimistically';
import type { AppState } from '../state/appState';
import type { UseProjectChannelResult } from './useProjectChannel';

export interface UseOfflineSyncOptions {
  projectId: string | null;
  isOffline: boolean;
  /** Roste při každém přijatém `full_state` — signál „je čas zkusit replay". */
  fullStateVersion: number;
  channel: UseProjectChannelResult;
}

export interface UseOfflineSyncResult {
  pendingCount: number;
  conflicts: Conflict[];
  syncMessage: string | null;
  purgedNotice: number | null;
  dismissSyncMessage: () => void;
  dismissPurgedNotice: () => void;
  resolveConflict: (conflict: Conflict, resolution: 'server' | 'mine') => void;
  resolveAllConflicts: (resolution: 'server' | 'mine') => void;
  refreshPendingCount: () => void;
}

/**
 * Přehraje jeden command a **teprve po potvrzení** ho smaže z fronty.
 *
 * Dřív se mazal hned po zavolání `sendCommand`, které je fire-and-forget:
 * když se spojení během přehrávání zase rozpadlo — tedy přesně v situaci,
 * kvůli které offline režim existuje — byl command už z fronty pryč a
 * uživatelova práce nenávratně ztracená.
 */
async function replayCommand(
  pending: PendingCommand,
  channel: UseProjectChannelResult
): Promise<void> {
  await channel.sendCommandAwaitable(pending.command, (state: AppState) =>
    applyCommandOptimistically(state, pending.command)
  );
  await removePendingCommand(pending.id);
}

function conflictingPendingIds(conflicts: Conflict[]): Set<string> {
  return new Set(conflicts.map((c) => c.pending.id));
}

interface ReplayResult {
  conflicts: Conflict[];
  replayedCount: number;
}

/** Tělo reconnect-replay efektu — vytaženo ven, aby hook zůstal pod ADR-012 rozpočtem. */
async function runReconnectReplay(
  projectId: string,
  serverState: AppState,
  before: AppState,
  channel: UseProjectChannelResult
): Promise<ReplayResult | null> {
  const pending = await getPendingCommands(projectId);
  if (pending.length === 0) return null;

  const found = detectConflicts(pending, serverState, before);
  const conflictingIds = conflictingPendingIds(found);
  const safe = pending.filter((p) => !conflictingIds.has(p.id));

  // Sekvenčně a s přerušením při první chybě: pořadí je významné (undo je
  // inverzní command nad tímtéž úkolem) a zbytek fronty musí zůstat
  // zachovaný pro další pokus.
  let replayedCount = 0;

  for (const command of safe) {
    try {
      await replayCommand(command, channel);
      replayedCount += 1;
    } catch {
      break;
    }
  }

  return { conflicts: found, replayedCount };
}

// ── 1. Počet čekajících commandů + expirace (FR-OFFLINE-03/08) ─────────────

interface PendingQueueState {
  pendingCount: number;
  purgedNotice: number | null;
  dismissPurgedNotice: () => void;
  refreshPendingCount: () => void;
}

function usePendingQueue(projectId: string | null): PendingQueueState {
  const [pendingCount, setPendingCount] = useState(0);
  const [purgedNotice, setPurgedNotice] = useState<number | null>(null);

  const refreshPendingCount = useCallback(() => {
    if (!projectId) return;
    getPendingCommands(projectId).then((list) => setPendingCount(list.length));
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    purgeExpiredCommands(projectId).then((purged) => {
      if (purged > 0) setPurgedNotice(purged);
      refreshPendingCount();
    });
  }, [projectId, refreshPendingCount]);

  return {
    pendingCount,
    purgedNotice,
    dismissPurgedNotice: () => setPurgedNotice(null),
    refreshPendingCount,
  };
}

// ── 2. Snapshot před odpojením + reconnect replay + conflict resolution ────

interface ReconnectReplayState {
  conflicts: Conflict[];
  syncMessage: string | null;
  dismissSyncMessage: () => void;
  resolveConflict: (conflict: Conflict, resolution: 'server' | 'mine') => void;
  resolveAllConflicts: (resolution: 'server' | 'mine') => void;
}

/** Zapamatuje `channel.state` při přechodu do offline; fallback na cache při startu appky rovnou offline (FR-OFFLINE-04). */
function useOfflineSnapshot(
  projectId: string | null,
  isOffline: boolean,
  channelState: AppState | null
): React.MutableRefObject<AppState | null> {
  const snapshotRef = useRef<AppState | null>(null);
  // Záměrně vždy `false` (ne `isOffline`) — chceme, aby první `isOffline===true`
  // render vždy prošel jako „přechod" a zachytil stav i pro appku startující
  // rovnou offline (viz fallback na cache níž).
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!projectId) return;
    if (isOffline && !wasOfflineRef.current) snapshotRef.current = channelState;
    if (isOffline && !snapshotRef.current) {
      getProjectCache(projectId).then((cached) => {
        // `confirmedState`, ne `state`: ten obsahuje i vlastní offline změny
        // a jako baseline konfliktů by je vydával za cizí zásah do serveru.
        if (cached) snapshotRef.current = cached.confirmedState ?? cached.state;
      });
    }
    wasOfflineRef.current = isOffline;
  }, [isOffline, projectId, channelState]);

  return snapshotRef;
}

interface UseReconnectReplayOptions {
  projectId: string | null;
  isOffline: boolean;
  fullStateVersion: number;
  channel: UseProjectChannelResult;
  refreshPendingCount: () => void;
}

interface ReplayOutcome {
  onConflicts: (conflicts: Conflict[]) => void;
  onSynced: (message: string) => void;
  refreshPendingCount: () => void;
}

/**
 * Jedno spuštění přehrávání fronty, ošetřené proti souběhu.
 *
 * Spouštěče jsou dva (viz níž) a pod zátěží se umí potkat. Dva souběžné běhy
 * čtou tutéž frontu, takže jeden může command vyhodnotit jako bezkonfliktní a
 * odeslat, zatímco druhý ho zároveň ukáže v dialogu konfliktů — uživatelovo
 * „Ponechat serverovou" pak přijde pozdě a cizí zápis je přepsaný.
 */
function useReplayRunner(
  projectId: string | null,
  channel: UseProjectChannelResult,
  snapshotRef: React.MutableRefObject<AppState | null>,
  outcome: ReplayOutcome
): () => void {
  const inFlightRef = useRef(false);
  const outcomeRef = useRef(outcome);
  outcomeRef.current = outcome;

  return useCallback(() => {
    if (!projectId || inFlightRef.current) return;
    // Potvrzený stav, ne zobrazený: `applyLocal` do `channel.state` zapisuje i
    // vlastní offline změny, takže by je `detectConflicts` porovnal proti
    // snapshotu a vyhodnotil jako cizí zásah — každá offline změna by po
    // návratu online hlásila konflikt sama se sebou.
    const serverState = channel.getLastConfirmedState() ?? channel.state;
    const before = snapshotRef.current;
    if (!serverState || !before) return;

    inFlightRef.current = true;
    runReconnectReplay(projectId, serverState, before, channel)
      .then((result) => {
        if (!result) return;
        const { onConflicts, onSynced, refreshPendingCount } = outcomeRef.current;
        refreshPendingCount();
        if (result.conflicts.length > 0) {
          onConflicts(result.conflicts);
          return;
        }
        snapshotRef.current = null;
        if (result.replayedCount > 0) {
          onSynced(`✓ Synchronizováno — ${result.replayedCount} změn přeneseno`);
        }
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [projectId, channel, snapshotRef]);
}

/** Oba spouštěče přehrávání — čerstvý `full_state` a návrat konektivity. */
function useReplayTriggers(
  isOffline: boolean,
  fullStateVersion: number,
  channel: UseProjectChannelResult,
  replay: () => void
): void {
  const lastHandledVersionRef = useRef(0);
  const wasOfflineRef = useRef(isOffline);

  // Spouštěč 1: dorazil čerstvý `full_state`, tedy proběhl (re)connect.
  //
  // Dokud jsme offline, přehrávat nemá smysl — odeslání by stejně selhalo a
  // porovnávalo by se proti stavu, který ještě není ten serverový.
  useEffect(() => {
    if (fullStateVersion === lastHandledVersionRef.current) return;
    lastHandledVersionRef.current = fullStateVersion;
    if (!isOffline) replay();
  }, [fullStateVersion, isOffline, replay]);

  // Spouštěč 2: appka se vrátila z offline, ANIŽ by se spojení rozpadlo.
  //
  // `isOffline` je OR dvou signálů (`navigator.onLine` a stav SignalR), takže
  // krátký výpadek na úrovni prohlížeče — uspaný stroj, přepnutá Wi-Fi — umí
  // appku poslat do offline režimu, aniž by hub spojení vůbec zaznamenalo. Pak
  // ale nepřijde žádný nový `full_state` a spouštěč 1 nesepne: fronta zůstala
  // ležet a banner mezitím zmizel, takže uživatel byl v dobré víře, že je
  // změna odeslaná. Odchytilo to až E2E, kde `context.setOffline` otevřený
  // WebSocket taky nezavře.
  //
  // Nepřehrává se tu rovnou: místo toho se vyžádá `full_state` a práci nechá
  // spouštěči 1. Bez toho by se fronta porovnávala proti stavu, do kterého se
  // ještě nemusely promítnout cizí změny nasbírané během výpadku — konflikt by
  // se přehlédl a cizí zápis by se tiše přepsal.
  useEffect(() => {
    const cameBackOnline = wasOfflineRef.current && !isOffline;
    wasOfflineRef.current = isOffline;
    if (cameBackOnline) channel.requestFullState();
  }, [isOffline, channel]);
}

function useReconnectReplay(options: UseReconnectReplayOptions): ReconnectReplayState {
  const { projectId, isOffline, fullStateVersion, channel, refreshPendingCount } = options;
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const snapshotRef = useOfflineSnapshot(projectId, isOffline, channel.state);

  const replay = useReplayRunner(projectId, channel, snapshotRef, {
    onConflicts: setConflicts,
    onSynced: setSyncMessage,
    refreshPendingCount,
  });
  useReplayTriggers(isOffline, fullStateVersion, channel, replay);

  const resolvePending = useCallback(
    async (pending: PendingCommand, resolution: 'server' | 'mine') => {
      if (resolution === 'mine') await replayCommand(pending, channel);
      else await removePendingCommand(pending.id);
    },
    [channel]
  );

  const finishIfNoConflictsLeft = useCallback(
    (remaining: Conflict[]) => {
      setConflicts(remaining);
      refreshPendingCount();
      if (remaining.length === 0) {
        snapshotRef.current = null;
        setSyncMessage('✓ Synchronizováno');
      }
    },
    [refreshPendingCount, snapshotRef]
  );

  const resolveConflict = useCallback(
    (conflict: Conflict, resolution: 'server' | 'mine') => {
      resolvePending(conflict.pending, resolution).then(() => {
        finishIfNoConflictsLeft(conflicts.filter((c) => c.pending.id !== conflict.pending.id));
      });
    },
    [conflicts, resolvePending, finishIfNoConflictsLeft]
  );

  const resolveAllConflicts = useCallback(
    (resolution: 'server' | 'mine') => {
      const unique = new Map(conflicts.map((c) => [c.pending.id, c.pending]));
      Promise.all([...unique.values()].map((p) => resolvePending(p, resolution))).then(() => {
        finishIfNoConflictsLeft([]);
      });
    },
    [conflicts, resolvePending, finishIfNoConflictsLeft]
  );

  return {
    conflicts,
    syncMessage,
    dismissSyncMessage: () => setSyncMessage(null),
    resolveConflict,
    resolveAllConflicts,
  };
}

// ── Vstupní bod ──────────────────────────────────────────────────────────

export function useOfflineSync(options: UseOfflineSyncOptions): UseOfflineSyncResult {
  const { projectId, isOffline, fullStateVersion, channel } = options;
  const queue = usePendingQueue(projectId);
  const replay = useReconnectReplay({
    projectId,
    isOffline,
    fullStateVersion,
    channel,
    refreshPendingCount: queue.refreshPendingCount,
  });

  return { ...queue, ...replay };
}
