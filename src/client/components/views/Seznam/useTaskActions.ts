// CRUD nad jednotlivým úkolem — inline editace polí, přidání a smazání.
import type { Categories, Task } from '../../../types';
import { uid } from '../../../utils';

export type SetTasks = React.Dispatch<React.SetStateAction<Task[]>>;

export interface TaskActions {
  updateTask: (id: string, field: keyof Task, value: string | number) => void;
  deleteTask: (id: string) => void;
  addTask: (personId: string) => void;
  addBacklogTask: () => void;
}

function newTask(personId: string, name: string, defaultCat: string): Task {
  return {
    id: uid(),
    p: personId,
    name,
    cat: defaultCat,
    s: 1,
    e: 1,
    md: 1,
    progress: 0,
    desc: '',
    links: [],
  };
}

const NUMERIC_FIELDS: ReadonlySet<keyof Task> = new Set(['md', 's', 'e', 'progress']);

/** Aplikace jedné inline editace pole — vytažené z `updateTask`, ať zůstane pod limitem kognitivní složitosti. */
function applyFieldUpdate(task: Task, field: keyof Task, value: string | number): Task {
  if (!NUMERIC_FIELDS.has(field)) return { ...task, [field]: value };

  const num = Number(value);
  // Progress smí být 0, ostatní číselná pole 0 odmítnou (fallback na původní hodnotu).
  if (field === 'progress') {
    return { ...task, [field]: Number.isNaN(num) ? (task[field] as number) : num };
  }
  return { ...task, [field]: num || (task[field] as number) };
}

export function useTaskActions(setTasks: SetTasks, cats: Categories): TaskActions {
  const defaultCat = Object.keys(cats)[0] || 'obecne';

  const updateTask = (id: string, field: keyof Task, value: string | number) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? applyFieldUpdate(t, field, value) : t)));
  };

  const deleteTask = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const addTask = (personId: string) =>
    setTasks((prev) => [...prev, newTask(personId, 'Nový úkol', defaultCat)]);

  const addBacklogTask = () =>
    setTasks((prev) => [...prev, newTask('', 'Nový backlog úkol', defaultCat)]);

  return { updateTask, deleteTask, addTask, addBacklogTask };
}
