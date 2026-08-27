// Centrální odesílání commandů — spojuje `useProjectChannel` (síť + optimistická
// aplikace), offline frontu (ADR-009) a per-session undo/redo (ADR-007) do
// jednoho `dispatch`. App.tsx (a přes něj slice settery) volá jen `dispatch`;
// nemusí se starat o to, jestli je klient online, ani o bookkeeping historie.
//
// Proč jeden hook a ne tři nezávislé volané postupně z App.tsx: undo/redo musí
// zaznamenat KAŽDÝ dispatchnutý command (kromě commandů, které jsou samy
// výsledkem undo/redo — jinak by Ctrl+Z vytvářel nekonečně rostoucí historii),
// a offline queueing musí běžet přesně na tom samém místě, kde se rozhoduje
// mezi online/offline cestou. Rozdělení do tří hooků by to rozdělení logiky
// jen přesunulo do App.tsx, což CLAUDE.md výslovně nechce („logiku kanálu,
// offline a undo/redo drž v hoocích, ne v komponentě").
import { useCallback, useEffect, useRef } from 'react';
import { applyCommandOptimistically } from '../state/applyCommandOptimistically';
import { invertCommand } from '../state/invertCommand';
import { enqueuePendingCommand, PendingQueueFullError } from '../storage/offlineQueue';
import { useUndoRedo } from './useUndoRedo';
import type { AppState } from '../state/appState';
import type { ProjectCommand } from '../types/protocol';
import type { ChannelConnectionStatus, UseProjectChannelResult } from './useProjectChannel';

export interface UseCommandDispatchOptions {
  projectId: string | null;
  channel: UseProjectChannelResult;
  connectionStatus: ChannelConnectionStatus;
  isOffline: boolean;
  /** FR-OFFLINE-03: fronta je plná — volající zobrazí varování uživateli. */
  onQueueFull?: (message: string) => void;
  /**
   * FR-OFFLINE-02: command přibyl do offline fronty.
   *
   * Bez tohohle hlášení se počítadlo v banneru načetlo jen při připojení a po
   * reconnectu, takže při práci offline pořád ukazovalo nulu — uživatel neměl
   * jak poznat, kolik změn mu ještě visí nepřenesených.
   */
  onQueued?: () => void;
  /** FR-COLLAB-07: volající sleduje vlastní zápisy pro detekci přepsání jiným uživatelem. */
  onDispatched?: (command: ProjectCommand) => void;
}

export interface UseCommandDispatchResult {
  dispatch: (command: ProjectCommand) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Statusy, po kterých následující "connected" znamená skutečný (re)connect. */
const RECONNECT_TRIGGERS: readonly ChannelConnectionStatus[] = ['reconnecting', 'disconnected'];

export function useCommandDispatch(options: UseCommandDispatchOptions): UseCommandDispatchResult {
  const { projectId, channel, connectionStatus, isOffline, onQueueFull, onQueued, onDispatched } =
    options;
  const history = useUndoRedo();

  const dispatchInternal = useCallback(
    (command: ProjectCommand, prevState: AppState, record: boolean) => {
      const applyOptimistic = (state: AppState) => applyCommandOptimistically(state, command);

      if (isOffline) {
        channel.applyLocal(applyOptimistic);
        if (projectId) {
          enqueuePendingCommand(projectId, command)
            .then(() => onQueued?.())
            .catch((err: unknown) => {
              if (err instanceof PendingQueueFullError) onQueueFull?.(err.message);
            });
        }
      } else {
        channel.sendCommand(command, applyOptimistic);
      }

      onDispatched?.(command);
      if (record) history.record(command, prevState);
    },
    [channel, isOffline, projectId, onQueueFull, onQueued, onDispatched, history]
  );

  const dispatch = useCallback(
    (command: ProjectCommand) => {
      if (!channel.state) return;
      dispatchInternal(command, channel.state, true);
    },
    [channel.state, dispatchInternal]
  );

  const undo = useCallback(() => {
    const entry = history.undo();
    if (!entry) return;
    const inverse = invertCommand(entry.command, entry.prevState);
    if (!inverse || !channel.state) return;
    dispatchInternal(inverse, channel.state, false);
  }, [history, channel.state, dispatchInternal]);

  const redo = useCallback(() => {
    const entry = history.redo();
    if (!entry || !channel.state) return;
    dispatchInternal(entry.command, channel.state, false);
  }, [history, channel.state, dispatchInternal]);

  // ADR-007: „undo se resetuje při reconnectu" — historie odkazuje na prevState
  // snímky, které po reconnectu (čerstvý full_state) už nemusí sedět na aktuální
  // serverový stav.
  const prevStatusRef = useRef(connectionStatus);
  useEffect(() => {
    const wasDisconnected = RECONNECT_TRIGGERS.includes(prevStatusRef.current);
    if (connectionStatus === 'connected' && wasDisconnected) history.reset();
    prevStatusRef.current = connectionStatus;
  }, [connectionStatus, history]);

  return { dispatch, undo, redo, canUndo: history.canUndo, canRedo: history.canRedo };
}
