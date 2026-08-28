// Kopírování hesla se samovyprázdněním schránky — FR-VAULT-06.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIPBOARD_CLEAR_MS, useClipboardCopy } from './useClipboardCopy';

/** jsdom nemá `navigator.clipboard` — nahrazuje ho paměťová atrapa. */
function stubClipboard(readable = true) {
  let content = '';
  const clipboard = {
    writeText: vi.fn(async (value: string) => {
      content = value;
    }),
    readText: vi.fn(async () => {
      if (!readable) throw new Error('zakázáno');
      return content;
    }),
  };
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  return { clipboard, read: () => content };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useClipboardCopy', () => {
  // @scenario: vault.feature > Kopírování hesla do schránky
  it('zkopíruje heslo a označí záznam jako zkopírovaný', async () => {
    const { read } = stubClipboard();
    const view = renderHook(() => useClipboardCopy());

    await act(async () => {
      await view.result.current.copy('e1', 'Tajne123');
    });

    expect(read()).toBe('Tajne123');
    expect(view.result.current.copiedId).toBe('e1');
  });

  // @scenario: vault.feature > Schránka se po chvíli vyprázdní
  it('po 30 sekundách schránku vyprázdní', async () => {
    // Schránka přežije zavření aplikace i odhlášení — heslo v ní je díra,
    // o které uživatel neví.
    const { read } = stubClipboard();
    const view = renderHook(() => useClipboardCopy());
    await act(async () => {
      await view.result.current.copy('e1', 'Tajne123');
    });

    await act(async () => {
      vi.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    });

    await waitFor(() => expect(read()).toBe(''));
    expect(view.result.current.copiedId).toBeNull();
  });

  it('cizí obsah zkopírovaný mezitím nechá být', async () => {
    // Uživatel si mezitím zkopíroval něco svého; mazat mu to nebudeme.
    const { clipboard, read } = stubClipboard();
    const view = renderHook(() => useClipboardCopy());
    await act(async () => {
      await view.result.current.copy('e1', 'Tajne123');
    });
    await clipboard.writeText('něco jiného');

    await act(async () => {
      vi.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    });

    await waitFor(() => expect(view.result.current.copiedId).toBeNull());
    expect(read()).toBe('něco jiného');
  });

  it('bez práva číst schránku ji radši vyprázdní', async () => {
    // Nejde ověřit, jestli tam heslo pořád je. Ponechané heslo je horší než
    // ztracená mezipaměť kopírování, takže se maže.
    const { read } = stubClipboard(false);
    const view = renderHook(() => useClipboardCopy());
    await act(async () => {
      await view.result.current.copy('e1', 'Tajne123');
    });

    await act(async () => {
      vi.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    });

    await waitFor(() => expect(read()).toBe(''));
  });
});
