// Sdílený harness pro KnowledgeBaseView.test.tsx — scénáře `knowledge-base.feature`.
// Stejný vzor jako `rizikaViewHarness.tsx`/`seznamViewHarness.tsx`: reálné
// command hooky (`useCommandDispatch` + `useAppCommands`) nad fake kanálem,
// který dělá tutéž optimistickou aplikaci jako produkční `useProjectChannel`,
// ale nad reaktivním `useState` — testy klikají na skutečně překreslené UI.
//
// Není to `*.test.ts(x)` soubor, takže ho Vitest sám o sobě nespustí jako
// sadu testů (stejná konvence jako `state/testFixtures.ts`).
import { useCallback, useState } from 'react';
import { render } from '@testing-library/react';
import { KnowledgeBaseView } from './KnowledgeBaseView';
import { useCommandDispatch } from '../../hooks/useCommandDispatch';
import { useAppCommands } from '../../hooks/appCommands';
import { makeAppState } from '../../state/testFixtures';
import type { AppState } from '../../state/appState';
import type { KBPage } from '../../types';
import type { ProjectCommand } from '../../types/protocol';
import type {
  ChannelConnectionStatus,
  UseProjectChannelResult,
} from '../../hooks/useProjectChannel';

/** Stejná optimistická aplikace jako produkční `useProjectChannel`, ale nad reaktivním `useState`. */
function useFakeChannel(
  initial: AppState,
  onCommand: (c: ProjectCommand) => void
): UseProjectChannelResult {
  const [state, setState] = useState<AppState | null>(initial);
  const sendCommand = useCallback(
    (command: ProjectCommand, applyOptimistic?: (s: AppState) => AppState) => {
      onCommand(command);
      if (applyOptimistic) setState((prev) => (prev ? applyOptimistic(prev) : prev));
    },
    [onCommand]
  );
  const applyLocal = useCallback((mutate: (s: AppState) => AppState) => {
    setState((prev) => (prev ? mutate(prev) : prev));
  }, []);
  return {
    state,
    fullStateVersion: 0,
    presence: [],
    connectionStatus: 'connected' as ChannelConnectionStatus,
    lastError: null,
    sendCommand,
    // Harness nesíťuje: awaitable varianta jen splní slib a potvrzený stav
    // je vždy `null` — offline logika se testuje jinde.
    sendCommandAwaitable: async (
      command: ProjectCommand,
      applyOptimistic?: (s: AppState) => AppState
    ) => {
      sendCommand(command, applyOptimistic);
    },
    getLastConfirmedState: () => null,
    applyLocal,
    seedFromCache: () => {},
    requestFullState: () => {},
  };
}

export interface RenderKbOptions {
  kbPages?: KBPage[];
}

export interface KbHarness {
  /** Všechny commandy odeslané dosud (v pořadí odeslání) — protějšek serveru. */
  dispatched: ProjectCommand[];
  commandsOf: <T extends ProjectCommand['type']>(type: T) => Extract<ProjectCommand, { type: T }>[];
  lastCommand: <T extends ProjectCommand['type']>(
    type: T
  ) => Extract<ProjectCommand, { type: T }> | undefined;
  /**
   * Simuluje diff od JINÉHO uživatele (server broadcast, mimo `dispatch` tohoto
   * klienta) — přímý zápis do stavu bez commandu, stejně jako `applyDiff` dělá
   * pro cizí diffy (`useProjectChannel` `options.onDiff`).
   */
  applyExternalKbUpdate: (pageId: string, fields: Partial<KBPage>) => void;
}

/** Vytažené tělo `Harness`, aby `renderKb` zůstal pod ADR-012 rozpočtem na délku funkce. */
function useHarnessWiring(
  initial: AppState,
  dispatched: ProjectCommand[],
  applyLocalRef: { current: (mutate: (s: AppState) => AppState) => void }
) {
  const onCommand = useCallback((c: ProjectCommand) => dispatched.push(c), [dispatched]);
  const channel = useFakeChannel(initial, onCommand);
  applyLocalRef.current = channel.applyLocal;
  const { dispatch } = useCommandDispatch({
    projectId: 'proj-1',
    channel,
    connectionStatus: 'connected',
    isOffline: false,
  });
  const commands = useAppCommands({
    state: channel.state,
    dispatch,
    applyLocal: channel.applyLocal,
  });
  return { state: channel.state, commands };
}

/** Vykreslí `KnowledgeBaseView` napojený na reálné command hooky s fake serverem — viz hlavička souboru. */
export function renderKb(options: RenderKbOptions = {}): KbHarness {
  const dispatched: ProjectCommand[] = [];
  const applyLocalRef = { current: (_mutate: (s: AppState) => AppState) => {} };
  const initial = makeAppState({ kbPages: options.kbPages ?? [] });

  function Harness() {
    const { state, commands } = useHarnessWiring(initial, dispatched, applyLocalRef);
    return (
      <KnowledgeBaseView
        kbPages={state?.kbPages ?? []}
        setKbPages={commands.setKbPages}
        projectId="p1"
      />
    );
  }

  render(<Harness />);

  return {
    dispatched,
    commandsOf: (type) =>
      dispatched.filter(
        (c): c is Extract<ProjectCommand, { type: typeof type }> => c.type === type
      ),
    lastCommand: (type) => {
      const sent = dispatched.filter(
        (c): c is Extract<ProjectCommand, { type: typeof type }> => c.type === type
      );
      return sent[sent.length - 1];
    },
    applyExternalKbUpdate: (pageId, fields) => {
      applyLocalRef.current((s) => ({
        ...s,
        kbPages: s.kbPages.map((p) => (p.id === pageId ? { ...p, ...fields } : p)),
      }));
    },
  };
}
