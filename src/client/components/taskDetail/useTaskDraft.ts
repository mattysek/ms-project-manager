// Rozpracovaná kopie úkolu — mění se lokálně, ven jde teprve „Uložit změny".
import { useCallback, useEffect, useState } from 'react';
import type { Task } from '../../types';
import { uid } from '../../utils';

export function useTaskDraft(task: Task) {
  const [editedTask, setEditedTask] = useState<Task>({ ...task });

  // Přišel jiný úkol (nebo diff od jiného uživatele) — začni znovu od něj.
  useEffect(() => {
    setEditedTask({ ...task });
  }, [task]);

  const updateField = useCallback(<K extends keyof Task>(field: K, value: Task[K]) => {
    setEditedTask((prev) => ({ ...prev, [field]: value }));
  }, []);

  const addLink = () =>
    setEditedTask((prev) => ({
      ...prev,
      links: [...(prev.links || []), { id: uid(), label: '', url: '' }],
    }));

  const updateLink = (lid: string, field: 'label' | 'url', value: string) =>
    setEditedTask((prev) => ({
      ...prev,
      links: (prev.links || []).map((l) => (l.id === lid ? { ...l, [field]: value } : l)),
    }));

  const deleteLink = (lid: string) =>
    setEditedTask((prev) => ({
      ...prev,
      links: (prev.links || []).filter((l) => l.id !== lid),
    }));

  return { editedTask, updateField, addLink, updateLink, deleteLink };
}

export type TaskDraft = ReturnType<typeof useTaskDraft>;
