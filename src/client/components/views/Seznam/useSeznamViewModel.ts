// Stav a odvozená data pro SeznamView — `index.tsx` z tohohle jen skládá JSX.
import type { Categories, PersonWithWeeks, Task } from '../../../types';
import type { TaskSectionHeader } from './TaskSection';
import { useCategoryManager } from './useCategoryManager';
import { useTaskActions } from './useTaskActions';
import { useTaskDragDrop } from './useTaskDragDrop';
import { useTaskEditor } from './useTaskEditor';
import { useTaskFilters } from './useTaskFilters';

export const BACKLOG_DROP_KEY = '__backlog__';
/** Titulek drag handle — stejný v backlogu i u osob. */
export const DRAG_TITLE = 'Přetáhněte pro změnu přiřazení';

export const ADD_BACKLOG_STYLE: React.CSSProperties = {
  padding: '2px 10px',
  background: '#1a1a2e',
  borderColor: '#64748b44',
  color: '#94a3b8',
  fontSize: 9,
};

export const ADD_TASK_STYLE: React.CSSProperties = {
  padding: '2px 10px',
  background: '#0d2210',
  borderColor: '#34d39944',
  color: '#6ee7b7',
  fontSize: 9,
};

interface UseSeznamViewModelArgs {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  people: PersonWithWeeks[];
  cats: Categories;
  setCats: React.Dispatch<React.SetStateAction<Categories>>;
  numWeeks: number;
}

export function useSeznamViewModel({
  tasks,
  setTasks,
  people,
  cats,
  setCats,
  numWeeks,
}: UseSeznamViewModelArgs) {
  const filters = useTaskFilters(tasks, people);
  const taskActions = useTaskActions(setTasks, cats);
  const editor = useTaskEditor(tasks);
  const drag = useTaskDragDrop(tasks, setTasks);
  const catMgr = useCategoryManager(cats, setCats, setTasks);

  const rowActions = {
    onUpdateField: taskActions.updateTask,
    onOpenDetail: editor.openDetail,
    onDelete: taskActions.deleteTask,
  };

  /** Modal je otevřený jen když `editingTask` existuje — id čteme z něj, ne z assertu. */
  const deleteEditedTask = () => {
    const editing = editor.editingTask;
    if (!editing) return;
    taskActions.deleteTask(editing.id);
    editor.closeDetail();
  };

  const meta = { cats, numWeeks };
  const backlogTasks = filters.filtered.filter((task) => !task.p);
  const backlogDrop = drag.dropTarget(BACKLOG_DROP_KEY, '');

  const backlogHeader: TaskSectionHeader = {
    color: '#64748b',
    title: 'Backlog',
    subtitle: 'nepřiřazené úkoly',
    addLabel: '+ Přidat do backlogu',
    addStyle: ADD_BACKLOG_STYLE,
    onAdd: taskActions.addBacklogTask,
  };

  return {
    filters,
    taskActions,
    editor,
    drag,
    catMgr,
    rowActions,
    deleteEditedTask,
    meta,
    backlogTasks,
    backlogDrop,
    backlogHeader,
  };
}

export type SeznamViewModel = ReturnType<typeof useSeznamViewModel>;
