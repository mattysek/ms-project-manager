// Sdílený harness pro RizikaView.test.tsx — scénáře `risks-opportunities.feature`.
// Stejný vzor jako `seznamViewHarness.tsx`: reálné command hooky
// (`useCommandDispatch` + `useAppCommands`) nad fake kanálem, který dělá tutéž
// optimistickou aplikaci jako produkční `useProjectChannel`, ale nad
// reaktivním `useState` — testy tak klikají na skutečně překreslené UI, ne na
// návratovou hodnotu hooku, a commandy se ověřují jako spy (ne proti serveru).
//
// Není to `*.test.ts(x)` soubor, takže ho Vitest sám o sobě nespustí jako
// sadu testů (stejná konvence jako `state/testFixtures.ts`).
import { useCallback, useState } from 'react';
import { render } from '@testing-library/react';
import { RizikaView } from './RizikaView';
import { useCommandDispatch } from '../../hooks/useCommandDispatch';
import { useAppCommands } from '../../hooks/appCommands';
import { useProjectDerivedData } from '../../hooks/useProjectDerivedData';
import { makeAppState } from '../../state/testFixtures';
import type { AppState } from '../../state/appState';
import type { ChangelogEntry, Opportunity, Risk, Task } from '../../types';
import type { MemberRole, ProjectCommand } from '../../types/protocol';
import type {
  ChannelConnectionStatus,
  UseProjectChannelResult,
} from '../../hooks/useProjectChannel';

/** Background risks-opportunities.feature: 2026-01-05 až 2026-06-26. */
const START = '2026-01-05';
const END = '2026-06-26';

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

export interface RenderRizikaOptions {
  risks?: Risk[];
  opps?: Opportunity[];
  tasks?: Task[];
  notes?: string;
  changelog?: ChangelogEntry[];
  role?: MemberRole;
}

export interface RizikaHarness {
  /** Všechny commandy odeslané dosud (v pořadí odeslání) — protějšek serveru. */
  dispatched: ProjectCommand[];
  commandsOf: <T extends ProjectCommand['type']>(type: T) => Extract<ProjectCommand, { type: T }>[];
  lastCommand: <T extends ProjectCommand['type']>(
    type: T
  ) => Extract<ProjectCommand, { type: T }> | undefined;
  /** Odmountuje view — protějšek přepnutí záložky v `AppViews`. */
  unmount: () => void;
}

/** Vytažené tělo `Harness`, aby `renderRizika` zůstal pod ADR-012 rozpočtem na délku funkce. */
function useHarnessWiring(initial: AppState, dispatched: ProjectCommand[], role: MemberRole) {
  const onCommand = useCallback((c: ProjectCommand) => dispatched.push(c), [dispatched]);
  const channel = useFakeChannel(initial, onCommand);
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
  const state = channel.state ?? initial;
  const derived = useProjectDerivedData(state.project, state.tasks, state.people);
  return { state, commands, derived, role };
}

/** Vykreslí `RizikaView` napojený na reálné command hooky s fake serverem — viz hlavička souboru. */
export function renderRizika(options: RenderRizikaOptions = {}): RizikaHarness {
  const dispatched: ProjectCommand[] = [];
  const role = options.role ?? 'pm';
  const initial = makeAppState({
    project: {
      ...makeAppState().project,
      startDate: START,
      endDate: END,
      notes: options.notes ?? '',
      changelog: options.changelog ?? [],
    },
    risks: options.risks ?? [],
    opps: options.opps ?? [],
    tasks: options.tasks ?? [],
  });

  function Harness() {
    const { state, commands, derived } = useHarnessWiring(initial, dispatched, role);
    return (
      <RizikaView
        risks={state.risks}
        setRisks={commands.setRisks}
        opps={state.opps}
        setOpps={commands.setOpps}
        project={state.project}
        updateProject={commands.updateProject}
        people={derived.people}
        tasks={state.tasks}
        weeks={derived.weeks}
        roles={state.roles}
        role={role}
        overallProgress={derived.overallProgress}
        projectId="proj-1"
      />
    );
  }

  const { unmount } = render(<Harness />);

  return {
    unmount,
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
  };
}
