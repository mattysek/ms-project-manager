// Sdílený harness pro testy SeznamView a (v něm vnořeného) TaskDetailModal —
// scénáře `docs/features/tasks.feature`. Stejný vzor jako AdoSyncView.test.tsx
// (reálné hooky, dispatch se ověřuje jako spy) kombinovaný s fake channelem z
// useCommandDispatch.test.ts — na rozdíl od něj ale potřebujeme, aby view při
// každé optimistické změně skutečně překreslilo (`useState`, ne uzavřená
// proměnná), protože testy klikají na viditelné UI, ne jen na návratovou
// hodnotu hooku.
//
// Není to `*.test.ts(x)` soubor, takže ho Vitest sám o sobě nespustí jako
// sadu testů (stejná konvence jako `state/testFixtures.ts`).
import { useCallback, useState } from 'react';
import { render } from '@testing-library/react';
import { SeznamView } from './Seznam';
import { useCommandDispatch } from '../../hooks/useCommandDispatch';
import { useAppCommands } from '../../hooks/appCommands';
import { makeAppState } from '../../state/testFixtures';
import type { AppState } from '../../state/appState';
import type { Categories, Person, PersonWithWeeks, Task } from '../../types';
import type { ProjectCommand } from '../../types/protocol';
import type {
  ChannelConnectionStatus,
  UseProjectChannelResult,
} from '../../hooks/useProjectChannel';

/** Background `tasks.feature`: projekt 2026-01-05 až 2026-06-26 = 26 týdnů. */
export const NUM_WEEKS = 26;

export const JAN: Person = {
  id: 'p1',
  userId: null,
  name: 'Jan Novák',
  role: 'AR',
  color: '#4f9cf9',
  weekAlloc: [],
};
export const PETRA: Person = {
  id: 'p2',
  userId: null,
  name: 'Petra Kolářová',
  role: 'BE',
  color: '#34d399',
  weekAlloc: [],
};

export const CATS: Categories = {
  obecne: { bg: '#94a3b818', bd: '#94a3b8', tx: '#94a3b8dd', label: 'obecne' },
  backend: { bg: '#4f9cf918', bd: '#4f9cf9', tx: '#4f9cf9dd', label: 'backend' },
};

function withWeeks(people: Person[]): PersonWithWeeks[] {
  return people.map((p) => ({ ...p, _weeks: [] }));
}

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

export interface RenderSeznamOptions {
  tasks?: Task[];
  people?: Person[];
  cats?: Categories;
}

export interface SeznamHarness {
  /** Všechny commandy odeslané dosud (v pořadí odeslání) — protějšek serveru. */
  dispatched: ProjectCommand[];
  commandsOf: <T extends ProjectCommand['type']>(type: T) => Extract<ProjectCommand, { type: T }>[];
  lastCommand: <T extends ProjectCommand['type']>(
    type: T
  ) => Extract<ProjectCommand, { type: T }> | undefined;
  /** „Stiskne Ctrl+Z" — `useCommandDispatch.undo` volaný přímo (stejná konvence jako `offline.feature`). */
  undo: () => void;
}

/** Vytažené tělo `Harness`, aby `renderSeznam` zůstal pod ADR-012 rozpočtem na délku funkce. */
function useHarnessWiring(
  initial: AppState,
  dispatched: ProjectCommand[],
  undoRef: { current: () => void }
) {
  const onCommand = useCallback((c: ProjectCommand) => dispatched.push(c), [dispatched]);
  const channel = useFakeChannel(initial, onCommand);
  const { dispatch, undo } = useCommandDispatch({
    projectId: 'proj-1',
    channel,
    connectionStatus: 'connected',
    isOffline: false,
  });
  undoRef.current = undo;
  const commands = useAppCommands({
    state: channel.state,
    dispatch,
    applyLocal: channel.applyLocal,
  });
  return { state: channel.state, commands };
}

/** Vykreslí `SeznamView` napojený na reálné command hooky s fake serverem — viz hlavička souboru. */
export function renderSeznam(options: RenderSeznamOptions = {}): SeznamHarness {
  const dispatched: ProjectCommand[] = [];
  const undoRef = { current: () => {} };
  const initial = makeAppState({
    tasks: options.tasks ?? [],
    people: options.people ?? [JAN, PETRA],
    cats: options.cats ?? CATS,
  });

  function Harness() {
    const { state, commands } = useHarnessWiring(initial, dispatched, undoRef);
    return (
      <SeznamView
        tasks={state?.tasks ?? []}
        setTasks={commands.setTasks}
        people={withWeeks(state?.people ?? [])}
        cats={state?.cats ?? {}}
        setCats={commands.setCats}
        roles={state?.roles ?? {}}
        numWeeks={NUM_WEEKS}
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
    undo: () => undoRef.current(),
  };
}
