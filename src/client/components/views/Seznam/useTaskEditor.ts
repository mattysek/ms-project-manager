// Stav otevřeného detailu úkolu (TaskDetailModal).
import { useState } from 'react';
import type { Task } from '../../../types';

export interface TaskEditorState {
  editingTask: Task | null;
  openDetail: (id: string) => void;
  closeDetail: () => void;
}

export function useTaskEditor(tasks: Task[]): TaskEditorState {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const editingTask = editingTaskId ? (tasks.find((t) => t.id === editingTaskId) ?? null) : null;

  return {
    editingTask,
    openDetail: setEditingTaskId,
    closeDetail: () => setEditingTaskId(null),
  };
}
