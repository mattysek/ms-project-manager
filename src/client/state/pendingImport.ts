// Předání naparsovaného importu z LandingPage do otevřeného projektu.
//
// Import parsuje soubor na klientovi (ADR-005), ale příkaz jde odeslat teprve
// po `JoinProject`. Mezi tím musí data někde počkat.
//
// **Nesmí to být `sessionStorage`.** Dřív se tam ukládal celý výsledek
// parsování včetně base64 obsahu příloh; u reálného exportu (9,6 MB ZIP →
// skoro 13 MB base64) to spolehlivě narazilo na kvótu úložiště (~5 MB) a import
// spadl na `Failed to execute 'setItem' on 'Storage': ... exceeded the quota`
// ve chvíli, kdy už na serveru vznikl prázdný projekt.
//
// Zdrojem pravdy je proto paměť — přechod na projekt je změna routy, ne reload,
// takže modul mezitím nikam nezmizí. Do `sessionStorage` se **best-effort**
// zrcadlí jen textová část (bez příloh), aby import přežil i obnovení stránky
// v tom krátkém okamžiku, než se projekt otevře.
import type { ParsedImportData } from '../utils/importExport';

const pending = new Map<string, ParsedImportData>();

const keyOf = (projectId: string) => `pendingImport:${projectId}`;

export function stashPendingImport(projectId: string, parsed: ParsedImportData): void {
  pending.set(projectId, parsed);

  try {
    const { files: _files, ...withoutFiles } = parsed;
    sessionStorage.setItem(keyOf(projectId), JSON.stringify(withoutFiles));
  } catch {
    // Kvóta nebo privátní režim. Data jsou v paměti, import proběhne;
    // nepřežil by jen reload v mezičase.
  }
}

/** Vyzvedne odložený import; druhé zavolání už nic nevrátí. */
export function takePendingImport(projectId: string): ParsedImportData | null {
  const fromMemory = pending.get(projectId);
  pending.delete(projectId);

  const raw = sessionStorage.getItem(keyOf(projectId));
  sessionStorage.removeItem(keyOf(projectId));

  if (fromMemory) return fromMemory;
  if (!raw) return null;

  // Po reloadu zbyla jen textová část — projekt se naimportuje bez příloh.
  try {
    const state = JSON.parse(raw) as Omit<ParsedImportData, 'files'>;
    return { ...state, files: [] };
  } catch {
    return null;
  }
}
