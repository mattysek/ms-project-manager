// Plovoucí vrstvy nad Ganttem — tooltip při hover a detail úkolu po kliknutí.
import type { Categories, PersonWithWeeks, Task, TooltipState } from '../../../types';
import { guessLabel } from '../../../utils';
import { Tooltip } from '../../Tooltip';
import { TaskDetailModal } from '../../TaskDetailModal';

interface GanttOverlaysProps {
  tooltip: TooltipState | null;
  editingTask: Task | null | undefined;
  cats: Categories;
  people: PersonWithWeeks[];
  numWeeks: number;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onCloseDetail: () => void;
}

export function GanttOverlays({
  tooltip,
  editingTask,
  cats,
  people,
  numWeeks,
  setTasks,
  onCloseDetail,
}: GanttOverlaysProps) {
  return (
    <>
      {tooltip && (
        <Tooltip
          task={tooltip.task}
          x={tooltip.x}
          y={tooltip.y}
          cats={cats}
          people={people}
          guessLabel={guessLabel}
        />
      )}
      {editingTask && (
        <TaskDetailModal
          task={editingTask}
          onSave={(updated) =>
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
          }
          onClose={onCloseDetail}
          onDelete={() => setTasks((prev) => prev.filter((t) => t.id !== editingTask.id))}
          cats={cats}
          people={people}
          numWeeks={numWeeks}
        />
      )}
    </>
  );
}
