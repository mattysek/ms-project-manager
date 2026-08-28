// Kopírování hesla do schránky s automatickým vyprázdněním — FR-VAULT-06.
//
// Schránka přežije zavření aplikace i odhlášení, takže heslo v ní je díra,
// o které uživatel neví. Po 30 sekundách se proto uklidí.
import { useCallback, useEffect, useRef, useState } from 'react';

/** Po jaké době se schránka vyprázdní (PRD-09, FR-VAULT-06). */
export const CLIPBOARD_CLEAR_MS = 30_000;

export interface UseClipboardCopyResult {
  /** Id naposledy zkopírovaného záznamu — pro potvrzení v UI. */
  copiedId: string | null;
  copy: (id: string, value: string) => Promise<void>;
}

export function useClipboardCopy(): UseClipboardCopyResult {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(async (id: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        // Číst schránku smíme jen s povolením. Když ho nemáme, nejde ověřit,
        // jestli tam heslo pořád je — a to je právě důvod ji radši vyprázdnit:
        // ponechané heslo je horší než ztracená mezipaměť kopírování.
        const current = await navigator.clipboard.readText().catch(() => value);
        if (current === value) await navigator.clipboard.writeText('');
      } catch {
        // Zakázaná schránka není chyba, kterou by měl uživatel řešit.
      }
      setCopiedId(null);
    }, CLIPBOARD_CLEAR_MS);
  }, []);

  return { copiedId, copy };
}
