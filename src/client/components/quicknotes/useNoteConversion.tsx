// Stav a modal konverze poznámky na úkol (FR-QN-07) — vytaženo z
// `AuthenticatedApp`, aby zůstal pod rozpočtem ADR-012 (délka funkce).
//
// Úkol vzniká v projektu, ke kterému poznámka patří, ne v tom, který je
// zrovna otevřený: převod nejdřív otevře projekt poznámky na Úkolech, teprve
// nad jeho stavem ukáže formulář a po uložení rozbalí detail nového úkolu.
import { useEffect, useState } from 'react';
import type { QuickNote } from '../../api/quickNotesApi';
import type { ProjectDerivedData } from '../../hooks/useProjectDerivedData';
import type { UseQuickNotesResult } from '../../hooks/useQuickNotes';
import type { AppState } from '../../state/appState';
import type { PersonWithWeeks, Task } from '../../types';
import type { MemberRole } from '../../types/protocol';
import { QuickNoteConversionModal } from './QuickNoteConversionModal';

export interface UseNoteConversionResult {
  requestConvert: (note: QuickNote) => void;
  modal: React.ReactNode;
}

interface NoteConversionCtx {
  notes: UseQuickNotesResult;
  state: AppState | null;
  derived: ProjectDerivedData;
  currentProjectId: string | null;
  /** Kdo převádí — Dev smí úkol přiřadit jen sobě (ADR-006). */
  viewer: { role: MemberRole | null; userId: string };
  openProjectTasks: (projectId: string) => void;
  focusTask: (taskId: string) => void;
  onCreated: (task: Task) => void;
}

/**
 * Komu smí převádějící úkol přiřadit.
 *
 * Server Devovi dovolí přidat úkol jen do backlogu nebo na osobu namapovanou
 * na jeho účet. Nabízet i ostatní by znamenalo odmítnutý command — a poznámka
 * by už byla označená jako převedená, takže by nešla zkusit znovu.
 */
function assignablePeople(
  people: PersonWithWeeks[],
  viewer: NoteConversionCtx['viewer']
): PersonWithWeeks[] {
  if (viewer.role === 'pm') return people;
  return people.filter((person) => person.userId === viewer.userId);
}

export function useNoteConversion({
  notes,
  state,
  derived,
  currentProjectId,
  viewer,
  openProjectTasks,
  focusTask,
  onCreated,
}: NoteConversionCtx): UseNoteConversionResult {
  const [convertingNote, setConvertingNote] = useState<QuickNote | null>(null);
  const targetProjectId = convertingNote?.linkedProjectId ?? null;

  // Uživatel mezitím odešel jinam (jiný projekt, seznam projektů) — formulář
  // by mu jinak vyskočil až při příštím otevření projektu poznámky.
  useEffect(() => {
    if (targetProjectId && currentProjectId !== targetProjectId) setConvertingNote(null);
  }, [currentProjectId, targetProjectId]);

  const requestConvert = (note: QuickNote) => {
    if (!note.linkedProjectId) return;
    setConvertingNote(note);
    openProjectTasks(note.linkedProjectId);
  };

  const handleCreated = (task: Task) => {
    onCreated(task);
    if (convertingNote) notes.markConverted(convertingNote.id, task.id);
    setConvertingNote(null);
    focusTask(task.id);
  };

  // `state` je po přepnutí projektu `null`, dokud nedorazí stav cílového
  // projektu — formulář tak nikdy nevznikne nad kategoriemi a lidmi toho
  // předchozího.
  const ready = !!state && !!targetProjectId && currentProjectId === targetProjectId;
  const modal =
    convertingNote && state && ready ? (
      <QuickNoteConversionModal
        note={convertingNote}
        cats={state.cats}
        people={assignablePeople(derived.people, viewer)}
        numWeeks={derived.numWeeks}
        onCreated={handleCreated}
        onClose={() => setConvertingNote(null)}
      />
    ) : null;

  return { requestConvert, modal };
}
