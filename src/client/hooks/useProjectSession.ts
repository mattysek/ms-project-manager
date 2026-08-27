// Skládá dohromady kanál k serveru, offline detekci/frontu a per-session
// undo/redo do jednoho rozhraní pro App.tsx (CLAUDE.md: „logiku kanálu,
// offline a undo/redo drž v hoocích, ne v komponentě").
//
// App.tsx z tohohle hooku dostane `state` (nebo `null`, dokud nedorazí první
// `full_state`/cache) a `dispatch` — nic víc k síti/offline/historii už
// nepotřebuje řešit. Slice settery v App.tsx pak jen skládají `ProjectCommand`
// a volají `dispatch`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectChannel } from './useProjectChannel';
import type { ProjectChannelTransport, UseProjectChannelResult } from './useProjectChannel';
import { useOfflineStatus } from './useOfflineStatus';
import { useCommandDispatch } from './useCommandDispatch';
import { useOfflineSync } from './useOfflineSync';
import { useCollabNotifications } from './useCollabNotifications';
import { useMyRole } from './useMyRole';
import { useAdoSync } from './useAdoSync';
import type { UseAdoSyncResult } from './useAdoSync';
import { getProjectCache, saveProjectCache } from '../storage/projectCache';
import type { AppState } from '../state/appState';
import type { Conflict } from '../state/detectConflicts';
import type { MemberRole, PresenceEntry, ProjectCommand, ProjectDiff } from '../types/protocol';
import type { ChannelConnectionStatus, ProjectChannelError } from './useProjectChannel';

export interface UseProjectSessionResult {
  state: AppState | null;
  presence: PresenceEntry[];
  connectionStatus: ChannelConnectionStatus;
  /** Roste s každým přijatým `full_state` — viz `useAppLifecycleEffects`. */
  fullStateVersion: number;
  isOffline: boolean;
  dispatch: (command: ProjectCommand) => void;
  /** Lokální (neperzistovaná) mutace — jen pro zdokumentované výjimky, viz `appCommands/useFilesCommand.ts`. */
  applyLocal: (mutate: (state: AppState) => AppState) => void;
  sendPresence: (view: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  pendingCount: number;
  conflicts: Conflict[];
  resolveConflict: (conflict: Conflict, resolution: 'server' | 'mine') => void;
  resolveAllConflicts: (resolution: 'server' | 'mine') => void;
  syncMessage: string | null;
  dismissSyncMessage: () => void;
  purgedNotice: number | null;
  dismissPurgedNotice: () => void;
  queueFullWarning: string | null;
  dismissQueueFullWarning: () => void;
  collabNotice: string | null;
  dismissCollabNotice: () => void;
  /** Role přihlášeného uživatele na tomto projektu — viz `useMyRole` (PRD-03, FR-ROLE-05/06). */
  myRole: MemberRole | null;
  /**
   * Poslední odmítnutí commandu serverem (`ErrorOccurred`).
   *
   * Kanál ho zaznamenával a vracel stav zpátky, ale nikdo ho nezobrazoval —
   * uživateli tak změna beze slova zmizela. Vysvětlení „proč" zná jen server
   * (oprávnění, archiv, neexistující entita), takže se jeho hláška musí dostat
   * až do UI.
   */
  lastError: ProjectChannelError | null;
  /** ADO Sync — stav mimo `AppState` a commandy k serveru (PRD-06, ADR-008). */
  ado: UseAdoSyncResult;
}

export interface UseProjectSessionOptions {
  /** Injektovatelný transport — jen pro testy (viz `useProjectChannel`). */
  createTransport?: (projectId: string) => ProjectChannelTransport;
  /** Id přihlášeného uživatele — vstup pro `useMyRole`. */
  userId?: string;
}

/**
 * FR-OFFLINE-04: cache drží nejčerstvější známý stav (aktualizuje se při
 * každé změně, ne jen na `full_state`) a appka může startovat rovnou offline
 * (server nedostupný, `full_state` nikdy nedorazí) — pak se `state` seedne
 * z poslední cache, aby uživatel viděl poslední známý stav místo věčné
 * loading obrazovky. `seedFromCache` je no-op, pokud mezitím dorazil
 * skutečný `full_state`.
 */
function useProjectCacheSync(
  projectId: string | null,
  channel: ReturnType<typeof useProjectChannel>
): void {
  useEffect(() => {
    if (!projectId || !channel.state) return;
    // Vedle zobrazeného stavu se ukládá i poslední potvrzený — bez něj by
    // detekce konfliktů po restartu v offline režimu neměla čistý baseline.
    saveProjectCache(projectId, channel.state, channel.getLastConfirmedState() ?? undefined);
  }, [projectId, channel.state, channel.getLastConfirmedState]);

  const seedFromCache = channel.seedFromCache;
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    getProjectCache(projectId).then((cached) => {
      if (!cancelled && cached) seedFromCache(cached.state);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, seedFromCache]);
}

/** Část výsledku, kterou `useProjectSession` jen přebírá z `useOfflineSync` (ADR-009). */
function offlineSyncResult(offlineSync: ReturnType<typeof useOfflineSync>) {
  return {
    pendingCount: offlineSync.pendingCount,
    conflicts: offlineSync.conflicts,
    resolveConflict: offlineSync.resolveConflict,
    resolveAllConflicts: offlineSync.resolveAllConflicts,
    syncMessage: offlineSync.syncMessage,
    dismissSyncMessage: offlineSync.dismissSyncMessage,
    purgedNotice: offlineSync.purgedNotice,
    dismissPurgedNotice: offlineSync.dismissPurgedNotice,
  };
}

/**
 * Kanál i s rozvětvením příchozích diffů mezi odběratele.
 *
 * `useAdoSync` potřebuje `dispatch`, ten vzniká až nad kanálem — a kanál
 * potřebuje `onDiff` už při vytvoření. Ref ten kruh rozvazuje; vrací se ven,
 * aby ho volající naplnil, jakmile `useAdoSync` existuje.
 */
function useChannelWithDiffBridge(
  projectId: string | null,
  options: UseProjectSessionOptions,
  collab: ReturnType<typeof useCollabNotifications>,
  myRole: ReturnType<typeof useMyRole>
) {
  const adoDiffRef = useRef<(diff: ProjectDiff) => void>(() => {});
  const onDiff = useMemo(
    () => (diff: ProjectDiff) => {
      collab.handleDiff(diff);
      myRole.handleDiff(diff);
      adoDiffRef.current(diff);
    },
    [collab, myRole]
  );
  const channel = useProjectChannel(projectId, {
    onDiff,
    createTransport: options.createTransport,
  });
  return { channel, adoDiffRef };
}

/** Ohlášení aktivní záložky; offline se neposílá (FR-COLLAB-04). */
function useSendPresence(
  sendCommand: UseProjectChannelResult['sendCommand'],
  isOffline: boolean
): (view: string) => void {
  return useCallback(
    (view: string) => {
      if (isOffline) return;
      sendCommand({ type: 'update_presence', view });
    },
    [sendCommand, isOffline]
  );
}

export function useProjectSession(
  projectId: string | null,
  options: UseProjectSessionOptions = {}
): UseProjectSessionResult {
  const collab = useCollabNotifications();
  const myRole = useMyRole(projectId, options.userId);
  const { channel, adoDiffRef } = useChannelWithDiffBridge(projectId, options, collab, myRole);
  const offlineStatus = useOfflineStatus(channel.connectionStatus);
  const { isOffline } = offlineStatus;

  const [queueFullWarning, setQueueFullWarning] = useState<string | null>(null);

  // `useOfflineSync` vzniká až pod dispatchem (potřebuje `fullStateVersion`),
  // takže se jeho `refreshPendingCount` předává přes ref — stejná indirekce
  // jako u `adoDiffRef` o pár řádků výš.
  const refreshPendingRef = useRef<() => void>(() => {});
  const notifyQueued = useCallback(() => refreshPendingRef.current(), []);

  const { dispatch, undo, redo, canUndo, canRedo } = useCommandDispatch({
    projectId,
    channel,
    connectionStatus: channel.connectionStatus,
    isOffline,
    onQueueFull: setQueueFullWarning,
    onQueued: notifyQueued,
    onDispatched: collab.noteOwnCommand,
  });

  const ado = useAdoSync(dispatch);
  adoDiffRef.current = ado.handleDiff;

  const offlineSync = useOfflineSync({
    projectId,
    isOffline,
    fullStateVersion: channel.fullStateVersion,
    channel,
  });
  refreshPendingRef.current = offlineSync.refreshPendingCount;

  useProjectCacheSync(projectId, channel);

  const sendPresence = useSendPresence(channel.sendCommand, isOffline);
  const dismissQueueFullWarning = useCallback(() => setQueueFullWarning(null), []);

  return {
    state: channel.state,
    presence: channel.presence,
    connectionStatus: channel.connectionStatus,
    fullStateVersion: channel.fullStateVersion,
    isOffline,
    dispatch,
    applyLocal: channel.applyLocal,
    sendPresence,
    undo,
    redo,
    canUndo,
    canRedo,
    ...offlineSyncResult(offlineSync),
    queueFullWarning,
    dismissQueueFullWarning,
    collabNotice: collab.message,
    dismissCollabNotice: collab.dismiss,
    myRole: myRole.role,
    lastError: channel.lastError,
    ado,
  };
}
