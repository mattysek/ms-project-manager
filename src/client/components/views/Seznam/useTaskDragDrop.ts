// Přetažení úkolu na jinou osobu (nebo do backlogu) — jeden zdroj pravdy pro
// obě sekce tabulky, které dřív měly skoro identické handlery zvlášť.
import { useState } from 'react';
import type { Task } from '../../../types';
import type { DragDropApi, DropZoneHandlers } from './types';
import type { SetTasks } from './useTaskActions';

export function useTaskDragDrop(tasks: Task[], setTasks: SetTasks): DragDropApi {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const onDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggingTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const onDragEnd = () => {
    setDraggingTaskId(null);
    setDropTargetKey(null);
  };

  const draggingTaskPerson = draggingTaskId
    ? tasks.find((t) => t.id === draggingTaskId)?.p
    : undefined;

  function dropTarget(key: string, assigneeId: string): DropZoneHandlers {
    const isOver = dropTargetKey === key && !!draggingTaskId && draggingTaskPerson !== assigneeId;
    return {
      isOver,
      onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dropTargetKey !== key) setDropTargetKey(key);
      },
      onDragLeave: (e) => {
        // Reaguje jen na opuštění celého kontejneru, ne přechod na vnořený element.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetKey(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId && draggingTaskId) {
          setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, p: assigneeId } : t)));
        }
        setDraggingTaskId(null);
        setDropTargetKey(null);
      },
    };
  }

  return { draggingTaskId, onDragStart, onDragEnd, dropTarget };
}
