// Offline chování Quick Notes (offline.feature, quick-notes.feature).
//
// Poznámky jdou přes REST, takže se do fronty commandů projektu nevejdou —
// mají vlastní IndexedDB frontu (`storage/noteQueue.ts`). Tyhle testy jedou
// nad hookem, ne nad panelem: pointa je v pořadí a identitě operací, ne v JSX.
import { act, renderHook, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/quickNotesApi';
import { clearNoteOps, getPendingNoteOps } from '../storage/noteQueue';
import { QUICK_NOTES_MAX, useQuickNotes } from './useQuickNotes';

/** Přepne `navigator.onLine` a vystřelí odpovídající událost. */
function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

beforeEach(async () => {
  await clearNoteOps();
  vi.spyOn(api, 'listNotes').mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Quick Notes offline', () => {
  // @scenario: offline.feature > Quick Notes fungují offline
  it('poznámka vytvořená offline se zobrazí a uloží do fronty', async () => {
    setOnline(false);
    const create = vi.spyOn(api, 'createNote');
    const { result } = renderHook(() => useQuickNotes());

    await act(async () => {
      await result.current.createNote('Nápad z porady');
    });

    expect(result.current.notes[0]?.content).toBe('Nápad z porady');
    expect(create).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    const queued = await getPendingNoteOps();
    expect(queued[0]?.op).toBe('create');
  });

  // @scenario: offline.feature > Poznámka vytvořená offline si po dohrání drží identitu
  it('vytvoření a dvě úpravy offline dají jednu poznámku s posledním textem', async () => {
    setOnline(false);
    const { result } = renderHook(() => useQuickNotes());

    await act(async () => {
      await result.current.createNote('první');
    });
    const noteId = result.current.notes[0]?.id ?? '';

    await act(async () => {
      await result.current.saveNote(noteId, 'druhá', null);
    });
    await act(async () => {
      await result.current.saveNote(noteId, 'třetí', null);
    });

    // Jedna poznámka v UI, tři operace ve frontě — všechny nad stejným id.
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0]?.content).toBe('třetí');

    const queued = await getPendingNoteOps();
    expect(queued.map((op) => op.op)).toEqual(['create', 'update', 'update']);
    expect(new Set(queued.map((op) => op.noteId))).toEqual(new Set([noteId]));
  });

  // @scenario: offline.feature > Poznámky se dohrají po obnovení spojení
  it('po obnovení spojení se fronta přehraje v pořadí a vyprázdní', async () => {
    setOnline(false);
    const { result } = renderHook(() => useQuickNotes());

    await act(async () => {
      await result.current.createNote('poznámka');
    });
    const noteId = result.current.notes[0]?.id ?? '';
    await act(async () => {
      await result.current.saveNote(noteId, 'upravená', null);
    });
    await act(async () => {
      await result.current.deleteNote(noteId);
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(3));

    const calls: string[] = [];
    vi.spyOn(api, 'createNote').mockImplementation(async (content, _linked, id) => {
      calls.push('create');
      return {
        id: id ?? 'srv',
        content,
        linkedProjectId: null,
        convertedToTaskId: null,
        createdAt: '',
        updatedAt: '',
      };
    });
    vi.spyOn(api, 'updateNote').mockImplementation(async (id, fields) => {
      calls.push('update');
      return {
        id,
        ...fields,
        createdAt: '',
        updatedAt: '',
      };
    });
    vi.spyOn(api, 'deleteNote').mockImplementation(async () => {
      calls.push('delete');
    });

    await act(async () => {
      setOnline(true);
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(calls).toEqual(['create', 'update', 'delete']);
    expect(await getPendingNoteOps()).toHaveLength(0);
  });

  // @scenario: quick-notes.feature > Dosažení limitu poznámek
  it('nad limitem se poznámka nevytvoří', async () => {
    setOnline(true);
    const full = Array.from({ length: QUICK_NOTES_MAX }, (_, i) => ({
      id: `n${i}`,
      content: `poznámka ${i}`,
      linkedProjectId: null,
      convertedToTaskId: null,
      createdAt: '2026-08-17T00:00:00Z',
      updatedAt: '2026-08-17T00:00:00Z',
    }));
    vi.spyOn(api, 'listNotes').mockResolvedValue(full);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const create = vi.spyOn(api, 'createNote');

    const { result } = renderHook(() => useQuickNotes());
    act(() => result.current.load());
    await waitFor(() => expect(result.current.notes).toHaveLength(QUICK_NOTES_MAX));

    await act(async () => {
      await result.current.createNote('přes limit');
    });

    expect(create).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      `Dosáhli jste limitu ${QUICK_NOTES_MAX} poznámek. Smažte některé starší.`
    );
    expect(result.current.notes).toHaveLength(QUICK_NOTES_MAX);
  });
});
