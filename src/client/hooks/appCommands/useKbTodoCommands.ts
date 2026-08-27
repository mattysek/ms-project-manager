import { useCallback } from 'react';
import { reconcileList } from '../../state/reconcileList';
import type { KBPage, RecurringReminder, TodoItem } from '../../types';
import type { AppCommandsDeps } from './types';

export interface KbTodoCommands {
  setKbPages: React.Dispatch<React.SetStateAction<KBPage[]>>;
  setTodos: React.Dispatch<React.SetStateAction<TodoItem[]>>;
  setReminders: React.Dispatch<React.SetStateAction<RecurringReminder[]>>;
}

/** `setKbPages`/`setTodos`/`setReminders` — KnowledgeBaseView, TodoView. */
export function useKbTodoCommands({ state, dispatch }: AppCommandsDeps): KbTodoCommands {
  const setKbPages = useCallback(
    (updater: KBPage[] | ((prev: KBPage[]) => KBPage[])) => {
      const prev = state?.kbPages ?? [];
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const commands = reconcileList(prev, next, {
        add: (page) => ({ type: 'add_kb_page', page }),
        update: (id, fields) => ({ type: 'update_kb_page', pageId: id, fields }),
        remove: (id) => ({ type: 'delete_kb_page', pageId: id }),
      });
      for (const command of commands) dispatch(command);
    },
    [state, dispatch]
  );

  const setTodos = useCallback(
    (updater: TodoItem[] | ((prev: TodoItem[]) => TodoItem[])) => {
      const prev = state?.todos ?? [];
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const commands = reconcileList(prev, next, {
        add: (todo) => ({ type: 'add_todo', todo }),
        update: (id, fields) => ({ type: 'update_todo', todoId: id, fields }),
        remove: (id) => ({ type: 'delete_todo', todoId: id }),
      });
      for (const command of commands) dispatch(command);
    },
    [state, dispatch]
  );

  const setReminders = useCallback(
    (updater: RecurringReminder[] | ((prev: RecurringReminder[]) => RecurringReminder[])) => {
      const prev = state?.reminders ?? [];
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const commands = reconcileList(prev, next, {
        add: (reminder) => ({ type: 'add_reminder', reminder }),
        update: (id, fields) => ({ type: 'update_reminder', reminderId: id, fields }),
        remove: (id) => ({ type: 'delete_reminder', reminderId: id }),
      });
      for (const command of commands) dispatch(command);
    },
    [state, dispatch]
  );

  return { setKbPages, setTodos, setReminders };
}
