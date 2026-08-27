// Stav a CRUD nad changelogem/meeting logem — nejnovější nahoře bez ohledu na
// pořadí ve stavu (Scenario: Záznamy changelogu jsou chronologicky seřazeny).
import { useMemo, useState } from 'react';
import type { ChangelogEntry, Project } from '../../../../types';

type UpdateProject = (field: keyof Project, val: string | number | ChangelogEntry[]) => void;

export function useChangelogEditing(changelog: ChangelogEntry[], updateProject: UpdateProject) {
  const [newEntry, setNewEntry] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const sortedChangelog = useMemo(
    () => [...changelog].sort((a, b) => b.date.localeCompare(a.date)),
    [changelog]
  );

  const addEntry = () => {
    if (!newEntry.trim()) return;
    const entry: ChangelogEntry = {
      id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString().slice(0, 10),
      text: newEntry.trim(),
    };
    updateProject('changelog', [entry, ...changelog]);
    setNewEntry('');
  };

  const deleteEntry = (id: string) => {
    updateProject(
      'changelog',
      changelog.filter((e) => e.id !== id)
    );
  };

  const startEdit = (entry: ChangelogEntry) => {
    setEditingId(entry.id);
    setEditText(entry.text);
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateProject(
      'changelog',
      changelog.map((e) => (e.id === editingId ? { ...e, text: editText.trim() || e.text } : e))
    );
    setEditingId(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  return {
    newEntry,
    setNewEntry,
    editingId,
    editText,
    setEditText,
    sortedChangelog,
    addEntry,
    deleteEntry,
    startEdit,
    saveEdit,
    cancelEdit,
  };
}
