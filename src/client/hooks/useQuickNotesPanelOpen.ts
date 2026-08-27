// Stav panelu (otevřen/zavřen) v localStorage, ne v DB (FR-QN-01) — přežije reload.
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'msproject.quickNotesOpen';

function readInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useQuickNotesPanelOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(readInitial);

  const set = useCallback((value: boolean) => {
    setOpen(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // localStorage může být nedostupný (privátní režim) — stav zůstane jen v paměti.
    }
  }, []);

  return [open, set];
}
