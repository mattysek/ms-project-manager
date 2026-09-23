// Konverze poznámky na úkol (FR-QN-07) — znovupoužije `TaskDetailModal`
// předvyplněný z obsahu poznámky; formulář samotný je beze změny.
import { useState } from 'react';
import type { QuickNote } from '../../api/quickNotesApi';
import type { Categories, PersonWithWeeks, Task } from '../../types';
import { uid } from '../../utils';
import { TaskDetailModal } from '../TaskDetailModal';

interface QuickNoteConversionModalProps {
  note: QuickNote;
  cats: Categories;
  people: PersonWithWeeks[];
  numWeeks: number;
  onCreated: (task: Task) => void;
  onClose: () => void;
}

function taskNameFrom(content: string): string {
  return (content.split('\n')[0] || content).slice(0, 60);
}

export function QuickNoteConversionModal({
  note,
  cats,
  people,
  numWeeks,
  onCreated,
  onClose,
}: QuickNoteConversionModalProps) {
  // Koncept vzniká jednou za život modalu. Jako obyčejná proměnná měl na
  // každý render nové id i identitu — a `useTaskDraft` se na novou identitu
  // resetuje, takže každé překreslení rodiče (presence, diff, autosave
  // poznámky) smazalo, co uživatel do formuláře vyplnil.
  const [draft] = useState<Task>(() => ({
    id: uid(),
    p: '',
    name: taskNameFrom(note.content),
    cat: Object.keys(cats)[0] || 'obecne',
    s: 1,
    e: 1,
    md: 1,
    progress: 0,
    desc: note.content,
    links: [],
  }));

  return (
    <TaskDetailModal
      task={draft}
      onSave={onCreated}
      onClose={onClose}
      cats={cats}
      people={people}
      numWeeks={Math.max(numWeeks, 1)}
    />
  );
}
