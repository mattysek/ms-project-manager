// CRUD nad quick notes (PRD-04, FR-QN-08) — REST, ne SignalR (poznámky jsou
// per-user a nepotřebují broadcast). Panel volá `load()` líně při prvním
// otevření (FR-QN se nemá načítat, dokud uživatel panel neotevře).
//
// Offline: každá mutace se aplikuje optimisticky do stavu a při výpadku jde
// do IndexedDB fronty (`useNoteSync`), která se po reconnectu přehraje.
// Poznámka dostane id na klientovi, takže úpravy a smazání fungují i dřív,
// než se `create` dostane na server.
//
// Hook je poskládaný ze tří menších kvůli rozpočtu ADR-012 na délku funkce:
// seznam a načítání, vytvoření, zbylé mutace.
import { useCallback, useState } from 'react';
import * as api from '../api/quickNotesApi';
import type { QuickNote } from '../api/quickNotesApi';
import { uid } from '../utils';
import { useNoteSync } from './useNoteSync';

export const QUICK_NOTES_MAX = 500;
export const QUICK_NOTES_WARN_AT = 400;
export const QUICK_NOTE_MAX_CHARS = 10000;

export interface UseQuickNotesResult {
  notes: QuickNote[];
  loaded: boolean;
  loading: boolean;
  /** Počet operací čekajících na dohrání (offline). */
  pendingCount: number;
  isOffline: boolean;
  load: () => void;
  /**
   * Založí novou poznámku s daným obsahem. Server odmítá prázdný obsah
   * (`QuickNotes.validateContent`), takže FR-QN-03 „prázdné poznámky se
   * neukládají" řeší volající — zavolá až při blur/uložení s neprázdným textem.
   */
  createNote: (content: string, linkedProjectId?: string | null) => Promise<QuickNote | null>;
  saveNote: (
    id: string,
    content: string,
    linkedProjectId: string | null
  ) => Promise<QuickNote | null>;
  deleteNote: (id: string) => Promise<void>;
  markConverted: (id: string, taskId: string) => Promise<void>;
}

type NoteSync = ReturnType<typeof useNoteSync>;
type SetNotes = React.Dispatch<React.SetStateAction<QuickNote[]>>;

function byUpdatedAtDesc(a: QuickNote, b: QuickNote): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

/**
 * Optimistická poznámka s **klientským** id. Server ho respektuje, takže
 * poznámka má identitu ještě před dohráním a offline úpravy se jí chytí.
 */
function draftNote(content: string, linkedProjectId: string | null): QuickNote {
  const now = new Date().toISOString();
  return {
    id: uid(),
    content,
    linkedProjectId,
    convertedToTaskId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Seznam poznámek a jeho líné načtení. Offline chyba není chyba — jen ticho. */
function useNoteList() {
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    () =>
      api
        .listNotes()
        .then((fetched) => setNotes([...fetched].sort(byUpdatedAtDesc)))
        .catch(() => {
          // Offline: v paměti zůstává optimistický stav.
        }),
    []
  );

  const load = useCallback(() => {
    if (loaded || loading) return;
    setLoading(true);
    refresh().finally(() => {
      setLoading(false);
      setLoaded(true);
    });
  }, [loaded, loading, refresh]);

  return { notes, setNotes, loaded, loading, load, refresh };
}

/** Vytvoření poznámky — online i offline stejnou cestou, liší se jen konec. */
function useCreateNote(notes: QuickNote[], setNotes: SetNotes, sync: NoteSync) {
  return useCallback(
    async (content: string, linkedProjectId: string | null = null) => {
      if (!content.trim()) return null;
      if (notes.length >= QUICK_NOTES_MAX) {
        alert(`Dosáhli jste limitu ${QUICK_NOTES_MAX} poznámek. Smažte některé starší.`);
        return null;
      }

      const trimmed = content.slice(0, QUICK_NOTE_MAX_CHARS);
      const optimistic = draftNote(trimmed, linkedProjectId);
      setNotes((prev) => [optimistic, ...prev]);
      const payload = { content: trimmed, linkedProjectId };

      if (sync.isOffline) {
        await sync.queueCreate(optimistic.id, payload);
        return optimistic;
      }

      try {
        const created = await api.createNote(trimmed, linkedProjectId, optimistic.id);
        setNotes((prev) => prev.map((note) => (note.id === optimistic.id ? created : note)));
        return created;
      } catch {
        await sync.queueCreate(optimistic.id, payload);
        return optimistic;
      }
    },
    [notes.length, setNotes, sync]
  );
}

/** Úprava, smazání a označení za převedenou na úkol. */
function useNoteMutations(notes: QuickNote[], setNotes: SetNotes, sync: NoteSync) {
  const applyUpdate = useCallback(
    async (id: string, fields: api.UpdateNoteFields) => {
      const now = new Date().toISOString();
      setNotes((prev) =>
        prev
          .map((note) => (note.id === id ? { ...note, ...fields, updatedAt: now } : note))
          .sort(byUpdatedAtDesc)
      );

      if (sync.isOffline) {
        await sync.queueUpdate(id, fields);
        return null;
      }

      try {
        const updated = await api.updateNote(id, fields);
        setNotes((prev) =>
          prev.map((note) => (note.id === id ? updated : note)).sort(byUpdatedAtDesc)
        );
        return updated;
      } catch {
        await sync.queueUpdate(id, fields);
        return null;
      }
    },
    [setNotes, sync]
  );

  const saveNote = useCallback(
    (id: string, content: string, linkedProjectId: string | null) =>
      applyUpdate(id, {
        content: content.slice(0, QUICK_NOTE_MAX_CHARS),
        linkedProjectId,
        convertedToTaskId: notes.find((n) => n.id === id)?.convertedToTaskId ?? null,
      }),
    [notes, applyUpdate]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (sync.isOffline) return sync.queueDelete(id);

      try {
        await api.deleteNote(id);
      } catch {
        await sync.queueDelete(id);
      }
    },
    [setNotes, sync]
  );

  const markConverted = useCallback(
    async (id: string, taskId: string) => {
      const existing = notes.find((n) => n.id === id);
      if (!existing) return;
      await applyUpdate(id, {
        content: existing.content,
        linkedProjectId: existing.linkedProjectId,
        convertedToTaskId: taskId,
      });
    },
    [notes, applyUpdate]
  );

  return { saveNote, deleteNote, markConverted };
}

export function useQuickNotes(): UseQuickNotesResult {
  const list = useNoteList();
  const sync = useNoteSync(list.refresh);
  const createNote = useCreateNote(list.notes, list.setNotes, sync);
  const mutations = useNoteMutations(list.notes, list.setNotes, sync);

  return {
    notes: list.notes,
    loaded: list.loaded,
    loading: list.loading,
    load: list.load,
    pendingCount: sync.pendingCount,
    isOffline: sync.isOffline,
    createNote,
    ...mutations,
  };
}
