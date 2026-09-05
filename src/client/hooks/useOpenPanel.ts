// Který plovoucí panel v horní liště je otevřený — PRD-04 (FR-QN-01), PRD-09,
// PRD-10 (FR-WL-10).
//
// Stav je jeden pro všechny panely schválně. Poznámky, trezor i výkazy sedí na
// stejném místě obrazovky (`FloatingPanel`), takže dva otevřené se překrývaly
// a spodní byl nedosažitelný. Kdyby si každý panel držel vlastní `open`, nešlo
// by to ohlídat jinak než tím, že by o sobě navzájem věděly.
//
// Volba přežívá reload (localStorage, ne DB — je to klientská nápověda, stejně
// jako panel poznámek odjakživa).
import { useCallback, useMemo, useState } from 'react';

export type PanelId = 'notes' | 'vault' | 'worklog';

const STORAGE_KEY = 'msproject.openPanel';

/** Klíč z doby, kdy se ukládalo jen „poznámky otevřené: ano/ne". */
const LEGACY_KEY = 'msproject.quickNotesOpen';

function readInitial(): PanelId | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'notes' || stored === 'vault' || stored === 'worklog') return stored;
    // Kdo měl panel poznámek otevřený před zavedením trezoru, ať ho po
    // aktualizaci najde otevřený dál.
    return localStorage.getItem(LEGACY_KEY) === 'true' ? 'notes' : null;
  } catch {
    return null;
  }
}

export interface OpenPanel {
  /** `null` = zavřeno; jinak právě jeden otevřený panel. */
  open: PanelId | null;
  /** Přepne panel. Otevření jednoho ostatní zavře. */
  toggle: (panel: PanelId) => void;
  close: () => void;
}

export function useOpenPanel(): OpenPanel {
  const [open, setOpen] = useState<PanelId | null>(readInitial);

  const remember = useCallback((value: PanelId | null) => {
    setOpen(value);
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value);
      else localStorage.removeItem(STORAGE_KEY);
      // Starý klíč by jinak při příštím startu přebil právě uloženou volbu.
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // localStorage může být nedostupný (privátní režim) — stav zůstane v paměti.
    }
  }, []);

  return useMemo(
    () => ({
      open,
      toggle: (panel: PanelId) => remember(open === panel ? null : panel),
      close: () => remember(null),
    }),
    [open, remember]
  );
}
