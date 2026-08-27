// Sdílený harness pro GanttView.test.tsx — scénáře `docs/features/gantt.feature`.
// Stejný vzor jako `seznamViewHarness.tsx`/`rizikaViewHarness.tsx`: reálné
// command hooky (`useCommandDispatch` + `useAppCommands`) nad fake kanálem,
// který dělá tutéž optimistickou aplikaci jako produkční `useProjectChannel`,
// ale nad reaktivním `useState` — testy tak klikají na skutečně překreslené
// UI a commandy se ověřují jako spy (ne proti serveru).
//
// Není to `*.test.ts(x)` soubor, takže ho Vitest sám o sobě nespustí jako
// sadu testů (stejná konvence jako `state/testFixtures.ts`).
import { useCallback, useState } from 'react';
import { render } from '@testing-library/react';
import { GanttView } from './GanttView';
import { useCommandDispatch } from '../../hooks/useCommandDispatch';
import { useAppCommands } from '../../hooks/appCommands';
import { useProjectDerivedData } from '../../hooks/useProjectDerivedData';
import { makeAppState } from '../../state/testFixtures';
import type { AppState } from '../../state/appState';
import type { Milestone, Person, Task } from '../../types';
import type { MemberRole, ProjectCommand } from '../../types/protocol';
import type {
  ChannelConnectionStatus,
  UseProjectChannelResult,
} from '../../hooks/useProjectChannel';

/**
 * Background `gantt.feature` uvádí „2026-01-05 až 2026-06-26 (26 týdnů)", ale
 * `computeWeeks` pro tenhle přesný rozsah vrací 25 týdnů (5.1. je pondělí,
 * 26.6. pátek — mezi nimi je jen 25 celých Po–Pá týdnů, ne 26; overengineered
 * ověřeno přes `computeWeeks` samotné). Scénář „Drag se zastaví na hranici
 * projektu" potřebuje existující W26, proto konec posouváme na pátek
 * skutečného 26. týdne (3.7.) — týdny W1–W25 (včetně svátků v W13/W14/W17/W18)
 * zůstávají identické, mění se jen existence W26.
 */
export const NUM_WEEKS = 26;
const END_DATE = '2026-07-03';

export const JAN: Person = {
  id: 'p1',
  name: 'Jan Novák',
  role: 'AR',
  color: '#4f9cf9',
  weekAlloc: [],
  userId: 'u-jan',
};
export const PETRA: Person = {
  id: 'p2',
  name: 'Petra Kolářová',
  role: 'BE',
  color: '#34d399',
  weekAlloc: [],
  userId: 'u-petra',
};

export const API_REFAKTORING: Task = {
  id: 't1',
  p: PETRA.id,
  name: 'API refaktoring',
  cat: 'obecne',
  s: 1,
  e: 4,
  md: 15,
  progress: 0,
  desc: '',
  links: [],
};
export const INFRASTRUKTURA: Task = {
  id: 't2',
  p: JAN.id,
  name: 'Infrastruktura',
  cat: 'obecne',
  s: 1,
  e: 2,
  md: 5,
  progress: 100,
  desc: '',
  links: [],
};
export const DATABAZOVA_MIGRACE: Task = {
  id: 't3',
  p: PETRA.id,
  name: 'Databázová migrace',
  cat: 'obecne',
  s: 5,
  e: 8,
  md: 10,
  progress: 0,
  desc: '',
  links: [],
};

export const M1_ALPHA: Milestone = {
  id: 'm1',
  title: 'M1 — Alpha',
  weekIndex: 3, // W4, 0-based
  checkItems: [],
};

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

export interface RenderGanttOptions {
  tasks?: Task[];
  people?: Person[];
  milestones?: Milestone[];
  role?: MemberRole | null;
  currentUserId?: string | null;
}

export interface GanttHarness {
  /** Všechny commandy odeslané dosud (v pořadí odeslání) — protějšek serveru. */
  dispatched: ProjectCommand[];
  commandsOf: <T extends ProjectCommand['type']>(type: T) => Extract<ProjectCommand, { type: T }>[];
  lastCommand: <T extends ProjectCommand['type']>(
    type: T
  ) => Extract<ProjectCommand, { type: T }> | undefined;
  /** „Stiskne Ctrl+Z" — `useCommandDispatch.undo` volaný přímo (stejná konvence jako `offline.feature`). */
  undo: () => void;
}

/** Vytažené tělo `Harness`, aby `renderGantt` zůstal pod ADR-012 rozpočtem na délku funkce. */
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
  const state = channel.state ?? initial;
  const derived = useProjectDerivedData(state.project, state.tasks, state.people);
  return { state, commands, derived };
}

/** Vykreslí `GanttView` napojený na reálné command hooky s fake serverem — viz hlavička souboru. */
export function renderGantt(options: RenderGanttOptions = {}): GanttHarness {
  const dispatched: ProjectCommand[] = [];
  const undoRef = { current: () => {} };
  const initial = makeAppState({
    tasks: options.tasks ?? [API_REFAKTORING, INFRASTRUKTURA, DATABAZOVA_MIGRACE],
    people: options.people ?? [JAN, PETRA],
    project: {
      ...makeAppState().project,
      endDate: END_DATE,
      milestones: options.milestones ?? [M1_ALPHA],
    },
  });

  function Harness() {
    const { state, commands, derived } = useHarnessWiring(initial, dispatched, undoRef);
    return (
      <GanttView
        people={derived.people}
        tasks={state.tasks}
        setTasks={commands.setTasks}
        weeks={derived.weeks}
        monthGroups={derived.monthGroups}
        cats={state.cats}
        roles={state.roles}
        lanes={derived.lanes}
        numWeeks={derived.numWeeks}
        milestones={state.project.milestones}
        role={options.role ?? 'pm'}
        currentUserId={options.currentUserId ?? 'u-jan'}
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
