// Sdílený harness pro TodoView.test.tsx — scénáře `docs/features/todo-reminders.feature`.
// Stejný vzor jako `kapacitaViewHarness.tsx`/`ganttViewHarness.tsx`: reálné
// command hooky (`useCommandDispatch` + `useAppCommands`) nad fake kanálem,
// který dělá tutéž optimistickou aplikaci jako produkční `useProjectChannel`,
// ale nad reaktivním `useState`.
//
// TODO a Reminders jsou per-user (ADR-004 doplněk „Routing diffů — ne
// všechno je broadcast") — server je doručuje jen spojení odesílatele, nikdy
// broadcastem ostatním. Z pohledu jednoho klienta (= tento harness) to
// vypadá stejně jako u ostatních entit: pošle command, dostane zpět diff na
// vlastní spojení, `applyDiff` ho aplikuje. Scénář „TODO jsou soukromé
// per-user" proto ověřuje server (`ReducerTests.fs`), ne frontend — frontend
// žádnou izolaci sám neimplementuje, jen zobrazuje, co dostane.
//
// Není to `*.test.ts(x)` soubor, takže ho Vitest sám o sobě nespustí jako
// sadu testů (stejná konvence jako `state/testFixtures.ts`).
import { useCallback, useState } from 'react';
import { render } from '@testing-library/react';
import { TodoView } from './TodoView';
import { useCommandDispatch } from '../../hooks/useCommandDispatch';
import { useAppCommands } from '../../hooks/appCommands';
import { makeAppState } from '../../state/testFixtures';
import type { AppState } from '../../state/appState';
import type { RecurringReminder, TodoItem } from '../../types';
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

export interface RenderTodoOptions {
  todos?: TodoItem[];
  reminders?: RecurringReminder[];
}

export interface TodoHarness {
  /** Všechny commandy odeslané dosud (v pořadí odeslání) — protějšek serveru. */
  dispatched: ProjectCommand[];
  commandsOf: <T extends ProjectCommand['type']>(type: T) => Extract<ProjectCommand, { type: T }>[];
  lastCommand: <T extends ProjectCommand['type']>(
    type: T
  ) => Extract<ProjectCommand, { type: T }> | undefined;
}

/** Vytažené tělo `Harness`, aby `renderTodo` zůstal pod ADR-012 rozpočtem na délku funkce. */
function useHarnessWiring(initial: AppState, dispatched: ProjectCommand[]) {
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
  return { state: channel.state ?? initial, commands };
}

/** Vykreslí `TodoView` napojenou na reálné command hooky s fake serverem — viz hlavička souboru. */
export function renderTodo(options: RenderTodoOptions = {}): TodoHarness {
  const dispatched: ProjectCommand[] = [];
  const initial = makeAppState({
    todos: options.todos ?? [],
    reminders: options.reminders ?? [],
  });

  function Harness() {
    const { state, commands } = useHarnessWiring(initial, dispatched);
    return (
      <TodoView
        reminders={state.reminders}
        setReminders={commands.setReminders}
        todos={state.todos}
        setTodos={commands.setTodos}
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
  };
}
