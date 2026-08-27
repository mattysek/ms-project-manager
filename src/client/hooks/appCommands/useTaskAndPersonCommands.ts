import { useCallback } from 'react';
import { reconcilePeople, reconcileTasks } from '../../state/reconcileList';
import type { Person, Task } from '../../types';
import type { AppCommandsDeps } from './types';

export interface TaskAndPersonCommands {
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setRawPeople: React.Dispatch<React.SetStateAction<Person[]>>;
}

/** `setTasks`/`setRawPeople` pro View komponenty — GanttView, SeznamView, KapacitaView, … */
export function useTaskAndPersonCommands({
  state,
  dispatch,
}: AppCommandsDeps): TaskAndPersonCommands {
  const setTasks = useCallback(
    (updater: Task[] | ((prev: Task[]) => Task[])) => {
      const prev = state?.tasks ?? [];
      const next = typeof updater === 'function' ? updater(prev) : updater;
      for (const command of reconcileTasks(prev, next)) dispatch(command);
    },
    [state, dispatch]
  );

  const setRawPeople = useCallback(
    (updater: Person[] | ((prev: Person[]) => Person[])) => {
      const prev = state?.people ?? [];
      const next = typeof updater === 'function' ? updater(prev) : updater;
      for (const command of reconcilePeople(prev, next)) dispatch(command);
    },
    [state, dispatch]
  );

  return { setTasks, setRawPeople };
}
