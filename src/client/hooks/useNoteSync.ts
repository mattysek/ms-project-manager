// Offline vrstva nad Quick Notes.
//
// Rozhoduje, jestli operace půjde rovnou na server, nebo do IndexedDB fronty,
// a po obnovení spojení frontu přehraje v původním pořadí. Vytaženo z
// `useQuickNotes`, aby tam zůstalo jen CRUD nad stavem (ADR-012, rozpočet
// na délku funkce).
import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api/quickNotesApi';
import {
  clearNoteOps,
  enqueueNoteOp,
  getPendingNoteOps,
  removeNoteOp,
  type NoteCreatePayload,
  type NoteUpdatePayload,
  type PendingNoteOp,
} from '../storage/noteQueue';

export interface UseNoteSyncResult {
  /** Kolik operací čeká na dohrání; panel to zobrazuje uživateli. */
  pendingCount: number;
  isOffline: boolean;
  queueCreate: (noteId: string, payload: NoteCreatePayload) => Promise<void>;
  queueUpdate: (noteId: string, payload: NoteUpdatePayload) => Promise<void>;
  queueDelete: (noteId: string) => Promise<void>;
}

/** Jedna operace na server. Chyba propadne volajícímu (replay se zastaví). */
async function sendOp(operation: PendingNoteOp): Promise<void> {
  if (operation.op === 'create') {
    await api.createNote(
      operation.payload.content,
      operation.payload.linkedProjectId,
      operation.noteId
    );
    return;
  }
  if (operation.op === 'update') {
    await api.updateNote(operation.noteId, operation.payload);
    return;
  }
  await api.deleteNote(operation.noteId);
}

export function useNoteSync(onReplayed: () => void): UseNoteSyncResult {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const replaying = useRef(false);
  // Callback drží volající v closure; přes ref se efekt nespouští při každém
  // renderu panelu.
  const onReplayedRef = useRef(onReplayed);
  onReplayedRef.current = onReplayed;

  const refreshCount = useCallback(async () => {
    setPendingCount((await getPendingNoteOps()).length);
  }, []);

  const enqueue = useCallback(
    async (operation: Parameters<typeof enqueueNoteOp>[0]) => {
      const stored = await enqueueNoteOp(operation);
      if (!stored) {
        alert('Fronta čekajících poznámek je plná — připojte se k síti.');
        return;
      }
      await refreshCount();
    },
    [refreshCount]
  );

  /**
   * Přehraje frontu. Při chybě se zastaví a operaci nechá ve frontě — pořadí
   * je významné (create → update → delete nad stejnou poznámkou), takže
   * přeskočit rozbitou operaci a pokračovat další by dalo horší výsledek než
   * zkusit to znovu příště.
   */
  const replay = useCallback(async () => {
    if (replaying.current) return;
    replaying.current = true;
    try {
      for (const operation of await getPendingNoteOps()) {
        await sendOp(operation);
        await removeNoteOp(operation.id);
      }
      onReplayedRef.current();
    } catch {
      // Zůstane ve frontě na příští pokus.
    } finally {
      replaying.current = false;
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    void refreshCount();

    const goOnline = () => {
      setIsOffline(false);
      void replay();
    };
    const goOffline = () => setIsOffline(true);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (navigator.onLine) void replay();

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [refreshCount, replay]);

  return {
    pendingCount,
    isOffline,
    queueCreate: (noteId, payload) => enqueue({ noteId, op: 'create', payload }),
    queueUpdate: (noteId, payload) => enqueue({ noteId, op: 'update', payload }),
    queueDelete: (noteId) => enqueue({ noteId, op: 'delete' }),
  };
}

export { clearNoteOps };
