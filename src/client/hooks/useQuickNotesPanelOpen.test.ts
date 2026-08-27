// Testy useQuickNotesPanelOpen — stav panelu v localStorage, ne v DB (PRD-04, FR-QN-01).
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useQuickNotesPanelOpen } from './useQuickNotesPanelOpen';

afterEach(() => {
  localStorage.clear();
});

describe('useQuickNotesPanelOpen', () => {
  it('výchozí stav je zavřeno, když localStorage nic neobsahuje', () => {
    const { result } = renderHook(() => useQuickNotesPanelOpen());

    expect(result.current[0]).toBe(false);
  });

  // @scenario: quick-notes.feature > Stav panelu (otevřen/zavřen) přežije reload stránky
  it('otevřený stav přežije "reload" — nová instance hooku čte stejnou hodnotu z localStorage', () => {
    const { result, unmount } = renderHook(() => useQuickNotesPanelOpen());

    act(() => result.current[1](true));
    unmount(); // simulace opuštění stránky (reload zahodí React strom i state)

    const { result: afterReload } = renderHook(() => useQuickNotesPanelOpen());

    expect(afterReload.current[0]).toBe(true);
  });
});
