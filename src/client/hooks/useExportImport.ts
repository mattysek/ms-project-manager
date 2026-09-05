// Export otevřeného projektu — čistě klientský (ADR-005: „Excel/PNG export…
// generuje soubor v browseru").
//
// Import tu byl taky, ale zmizel s tlačítkem v hlavičce: přepsat celý stav
// otevřeného projektu jedním `full_state_import` je nůž, který vedle
// nenápadného „Export" nemá co dělat. Import ze zálohy zakládá nový projekt
// a žije na LandingPage (`importAsNewProject`), kde nemá co přepsat.
import { useCallback } from 'react';
import JSZip from 'jszip';
import { fetchFileBlob } from '../api/filesApi';
import type { AppState } from '../state/appState';

interface UseExportImportOptions {
  /** `null`, dokud nedorazí `full_state`/cache — export pak no-opuje. */
  state: AppState | null;
  isOffline: boolean;
}

export interface UseExportImportResult {
  exportProject: () => Promise<void>;
}

function slugify(name: string): string {
  return name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function buildPayload(state: AppState, isOffline: boolean): Record<string, unknown> {
  const {
    project,
    people,
    tasks,
    cats,
    roles,
    risks,
    opps,
    reminders,
    todos,
    kbPages,
    adoConfig,
    adoSyncLog,
  } = state;
  const payload: Record<string, unknown> = {
    _version: 1,
    _exported: new Date().toISOString(),
    project,
    people,
    tasks,
    cats,
    roles,
    risks,
    opps,
    files: [],
    reminders,
    todos,
    kbPages,
    adoConfig,
    adoSyncLog,
  };
  // FR-OFFLINE-07: offline export funguje, ale nad lokální (možná stale) cache.
  if (isOffline)
    payload._offlineWarning = 'Exportováno v offline režimu — stav nemusí být zcela aktuální';
  return payload;
}

/**
 * Nabídne blob ke stažení.
 *
 * Kotva musí být v dokumentu a `revokeObjectURL` se smí zavolat až po
 * doběhnutí smyčky událostí: stahování se rozjíždí asynchronně, takže
 * zneplatnění URL hned za `click()` ho stihne zrušit dřív, než vůbec začne.
 * Export se pak navenek tvářil, že proběhl, ale žádný soubor nevznikl.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadJSON(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  triggerDownload(blob, filename);
}

async function downloadZip(
  payload: Record<string, unknown>,
  files: AppState['files'],
  slug: string
): Promise<void> {
  const zip = new JSZip();
  const projectPayload = {
    ...payload,
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      addedAt: f.addedAt,
      note: f.note,
    })),
  };
  zip.file('project.json', JSON.stringify(projectPayload, null, 2));
  zip.file(
    'manifest.txt',
    [
      'Kapacitní plán - Export',
      'Verze: 1',
      `Exportováno: ${new Date().toISOString()}`,
      `Počet příloh: ${files.length}`,
    ].join('\n')
  );

  const filesFolder = zip.folder('files');
  if (filesFolder) {
    // Obsah příloh je po ADR-010 na serveru, ne ve stavu projektu — export si
    // ho musí stáhnout. Soubor, který se stáhnout nepovede, export neshodí;
    // chybí pak v ZIPu, ale metadata v `project.json` zůstanou.
    for (const file of files) {
      try {
        filesFolder.file(`${file.id}_${file.name}`, await fetchFileBlob(file.id));
      } catch {
        // Úmyslně potichu — jednotlivá nedostupná příloha nemá bránit exportu.
      }
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `kapacitni-plan-${slug}.zip`);
}

export function useExportImport({
  state,
  isOffline,
}: UseExportImportOptions): UseExportImportResult {
  const exportProject = useCallback(async () => {
    if (!state) return;
    const slug = slugify(state.project.name);
    const payload = buildPayload(state, isOffline);
    if (state.files.length === 0) {
      downloadJSON(payload, `kapacitni-plan-${slug}.json`);
      return;
    }
    await downloadZip(payload, state.files, slug);
  }, [state, isOffline]);

  return { exportProject };
}
