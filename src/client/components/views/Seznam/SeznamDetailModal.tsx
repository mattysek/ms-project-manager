import type { Categories, PersonWithWeeks, Task } from '../../../types';
import { TaskDetailModal } from '../../TaskDetailModal';
import type { SeznamViewModel } from './useSeznamViewModel';

interface SeznamDetailModalProps {
  vm: SeznamViewModel;
  cats: Categories;
  people: PersonWithWeeks[];
  numWeeks: number;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

export function SeznamDetailModal({
  vm,
  cats,
  people,
  numWeeks,
  setTasks,
}: SeznamDetailModalProps) {
  if (!vm.editor.editingTask) return null;

  return (
    <TaskDetailModal
      task={vm.editor.editingTask}
      cats={cats}
      people={people}
      numWeeks={numWeeks}
      onSave={(updated) =>
        setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)))
      }
      onDelete={vm.deleteEditedTask}
      onClose={vm.editor.closeDetail}
    />
  );
}
