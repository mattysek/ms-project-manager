// Který plovoucí panel je otevřený — quick-notes.feature, PRD-04 (FR-QN-01).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useOpenPanel } from './useOpenPanel';

afterEach(() => {
  localStorage.clear();
});

describe('useOpenPanel', () => {
  it('výchozí stav je zavřeno', () => {
    const { result } = renderHook(() => useOpenPanel());

    expect(result.current.open).toBeNull();
  });

  it('kliknutí panel otevře a druhé kliknutí zavře', () => {
    const { result } = renderHook(() => useOpenPanel());

    act(() => result.current.toggle('notes'));
    expect(result.current.open).toBe('notes');

    act(() => result.current.toggle('notes'));
    expect(result.current.open).toBeNull();
  });

  // @scenario: quick-notes.feature > Otevřený je vždy jen jeden panel
  it('otevření druhého panelu ten první zavře', () => {
    // Oba sedí na stejném místě obrazovky — dva otevřené se překrývají.
    const { result } = renderHook(() => useOpenPanel());
    act(() => result.current.toggle('notes'));

    act(() => result.current.toggle('vault'));

    expect(result.current.open).toBe('vault');
  });

  it('zavření zavře, ať byl otevřený kterýkoli', () => {
    const { result } = renderHook(() => useOpenPanel());
    act(() => result.current.toggle('vault'));

    act(() => result.current.close());

    expect(result.current.open).toBeNull();
  });

  // @scenario: quick-notes.feature > Stav panelu (otevřen/zavřen) přežije reload stránky
  it('volba přežije reload — nová instance čte stejnou hodnotu', () => {
    const { result, unmount } = renderHook(() => useOpenPanel());
    act(() => result.current.toggle('vault'));
    unmount(); // reload zahodí React strom i state

    const { result: afterReload } = renderHook(() => useOpenPanel());

    expect(afterReload.current.open).toBe('vault');
  });

  it('zavřený stav reload taky přežije', () => {
    const { result, unmount } = renderHook(() => useOpenPanel());
    act(() => result.current.toggle('notes'));
    act(() => result.current.close());
    unmount();

    const { result: afterReload } = renderHook(() => useOpenPanel());

    expect(afterReload.current.open).toBeNull();
  });

  it('otevřené poznámky ze starší verze zůstanou otevřené', () => {
    // Dřív se ukládalo jen „poznámky otevřené: ano/ne"; po aktualizaci nemá
    // uživateli panel zmizet pod rukama.
    localStorage.setItem('msproject.quickNotesOpen', 'true');

    const { result } = renderHook(() => useOpenPanel());

    expect(result.current.open).toBe('notes');
  });

  it('starý klíč nepřebije novější volbu', () => {
    localStorage.setItem('msproject.quickNotesOpen', 'true');
    const { result, unmount } = renderHook(() => useOpenPanel());

    act(() => result.current.toggle('vault'));
    unmount();

    const { result: afterReload } = renderHook(() => useOpenPanel());
    expect(afterReload.current.open).toBe('vault');
  });

  it('nedostupný localStorage stav neshodí', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('privátní režim');
    };

    const { result } = renderHook(() => useOpenPanel());
    act(() => result.current.toggle('notes'));

    // Volba drží aspoň v paměti — jen nepřežije reload.
    expect(result.current.open).toBe('notes');
    Storage.prototype.setItem = original;
  });
});
