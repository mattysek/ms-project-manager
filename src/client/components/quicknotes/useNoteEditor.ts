// Lokální draft editace jedné poznámky + autosave (FR-QN-03, FR-QN-04).
//
// Nová poznámka nemá `noteId`, dokud nedostane první neprázdný obsah — server
// prázdný obsah odmítá (`QuickNotes.validateContent`), takže dokud uživatel
// nic nenapíše, na server se nic neposílá (scénář „Minimální obsah poznámky").
import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuickNote } from '../../api/quickNotesApi';

const AUTOSAVE_DEBOUNCE_MS = 2000;

export interface UseNoteEditorOptions {
  note: QuickNote | null;
  onCreate: (content: string, linkedProjectId: string | null) => Promise<QuickNote | null>;
  onSave: (
    id: string,
    content: string,
    linkedProjectId: string | null
  ) => Promise<QuickNote | null>;
  /** Zavoláno po úspěšném založení draftu — parent přepne výběr na skutečné id. */
  onPersisted: (note: QuickNote) => void;
}

export interface UseNoteEditorResult {
  content: string;
  setContent: (value: string) => void;
  linkedProjectId: string | null;
  setLinkedProjectId: (value: string | null) => void;
  savedAt: number | null;
  flush: () => void;
  readOnly: boolean;
}

export function useNoteEditor(options: UseNoteEditorOptions): UseNoteEditorResult {
  const { note, onCreate, onSave, onPersisted } = options;
  const [content, setContent] = useState(note?.content ?? '');
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(
    note?.linkedProjectId ?? null
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const noteIdRef = useRef<string | null>(note?.id ?? null);
  const lastSavedRef = useRef(content);
  // Samostatný ref pro naposledy uložený projekt (FR-QN-06) — beze změny textu
  // by porovnání jen `content` nikdy neuložilo změnu samotného přiřazení k
  // projektu (scénář „Link poznámky na projekt").
  const lastSavedProjectRef = useRef(linkedProjectId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Efekt má resetovat lokální draft výhradně při přepnutí na jinou poznámku.
  // Kdyby závisel i na note?.content/note?.linkedProjectId, přepsal by rozepsaný
  // draft pokaždé, když parent po autosave dostane zpátky aktuální poznámku
  // (scénář „Autosave během psaní" by ztrácel poslední znaky).
  // biome-ignore lint/correctness/useExhaustiveDependencies: záměrně jen [note?.id], viz komentář výše
  useEffect(() => {
    // Draft, který se právě uložil, dostane od parenta své id (`onPersisted`).
    // To není přepnutí na jinou poznámku — reset by zahodil, co uživatel
    // stihl dopsat, zatímco se čekalo na server.
    if (note && note.id === noteIdRef.current) return;
    setContent(note?.content ?? '');
    setLinkedProjectId(note?.linkedProjectId ?? null);
    noteIdRef.current = note?.id ?? null;
    lastSavedRef.current = note?.content ?? '';
    lastSavedProjectRef.current = note?.linkedProjectId ?? null;
  }, [note?.id]);

  const persist = useCallback(
    async (value: string, projectId: string | null) => {
      const unchanged = value === lastSavedRef.current && projectId === lastSavedProjectRef.current;
      if (!value.trim() || unchanged) return;
      lastSavedRef.current = value;
      lastSavedProjectRef.current = projectId;
      const saved = noteIdRef.current
        ? await onSave(noteIdRef.current, value, projectId)
        : await onCreate(value, projectId);
      if (saved) {
        if (!noteIdRef.current) {
          noteIdRef.current = saved.id;
          onPersisted(saved);
        }
        setSavedAt(Date.now());
      }
    },
    [onCreate, onSave, onPersisted]
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => persist(content, linkedProjectId), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, linkedProjectId, persist]);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    persist(content, linkedProjectId);
  }, [content, linkedProjectId, persist]);

  return {
    content,
    setContent,
    linkedProjectId,
    setLinkedProjectId,
    savedAt,
    flush,
    readOnly: !!note?.convertedToTaskId,
  };
}
