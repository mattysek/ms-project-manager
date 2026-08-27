// Stav a modal konverze poznámky na úkol (FR-QN-07) — vytaženo z
// `AuthenticatedApp`, aby zůstal pod rozpočtem ADR-012 (délka funkce).
import { useState } from 'react';
import type { Task } from '../../types';
import type { QuickNote } from '../../api/quickNotesApi';
import type { UseQuickNotesResult } from '../../hooks/useQuickNotes';
import type { AppState } from '../../state/appState';
import type { ProjectDerivedData } from '../../hooks/useProjectDerivedData';
import { QuickNoteConversionModal } from './QuickNoteConversionModal';

export interface UseNoteConversionResult {
  requestConvert: (note: QuickNote) => void;
  modal: React.ReactNode;
}

interface NoteConversionCtx {
  notes: UseQuickNotesResult;
  state: AppState | null;
  derived: ProjectDerivedData;
  onCreated: (task: Task) => void;
}

export function useNoteConversion({
  notes,
  state,
  derived,
  onCreated,
}: NoteConversionCtx): UseNoteConversionResult {
  const [convertingNote, setConvertingNote] = useState<QuickNote | null>(null);

  const handleCreated = (task: Task) => {
    onCreated(task);
    if (convertingNote) notes.markConverted(convertingNote.id, task.id);
    setConvertingNote(null);
  };

  const modal =
    convertingNote && state ? (
      <QuickNoteConversionModal
        note={convertingNote}
        cats={state.cats}
        people={derived.people}
        numWeeks={derived.numWeeks}
        onCreated={handleCreated}
        onClose={() => setConvertingNote(null)}
      />
    ) : null;

  return { requestConvert: setConvertingNote, modal };
}
