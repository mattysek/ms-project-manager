// Dva vedlejší efekty vázané na otevřený projekt v App.tsx — vytažené do
// vlastního hooku, aby `App()` zůstal pod rozpočtem ADR-012 (60 řádků,
// kognitivní složitost 15) a aby `useEffect` dependency pole odpovídalo
// skutečně použitým hodnotám (Biome `lint/correctness/useExhaustiveDependencies`
// neumí potlačit `eslint-disable` komentářem — bere v úvahu jen reálné závislosti).
import { useEffect, useRef } from 'react';
import { forImportCommand } from '../state/appState';
import { uploadImported } from '../state/importAttachments';
import { takePendingImport } from '../state/pendingImport';
import type { AppState } from '../state/appState';
import type { ProjectCommand } from '../types/protocol';

interface LifecycleDeps {
  currentProjectId: string | null;
  view: string;
  state: AppState | null;
  /**
   * Roste s každým `full_state`, tj. po každém `JoinProject`. Presence se na něj
   * váže, protože server při připojení nastaví `View = ""` (`PresenceTracker.Join`)
   * a sám ho nikdy nedoplní — bez toho avatar autora ukazoval tooltip s prázdnou
   * záložkou („Jan Novák — ") až do prvního ručního přepnutí tabu, a totéž se
   * dělo znovu po každém reconnectu.
   */
  fullStateVersion: number;
  sendPresence: (view: string) => void;
  dispatch: (command: ProjectCommand) => void;
  /** Hlášení o přílohách, které se nepodařilo nahrát — vykresluje `NoticeBanner`. */
  onImportWarning?: (message: string) => void;
}

export function useAppLifecycleEffects({
  currentProjectId,
  view,
  state,
  fullStateVersion,
  sendPresence,
  dispatch,
  onImportWarning,
}: LifecycleDeps): void {
  // Presence (FR-COLLAB-04): server se dozví, na jaké záložce uživatel je —
  // při přepnutí view i při (re)připojení.
  //
  // `fullStateVersion` je tu jako SPOUŠŤ, ne jako hodnota: efekt jeho obsah
  // nečte, ale každý nový `full_state` znamená, že proběhl `JoinProject`,
  // a ten na serveru nastaví `View = ""`. Bez něj zůstal avatar uživatele s
  // prázdnou záložkou v tooltipu až do prvního ručního přepnutí tabu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fullStateVersion je spoušť po (re)connectu, viz komentář výše
  useEffect(() => {
    if (currentProjectId) sendPresence(view);
  }, [view, currentProjectId, fullStateVersion, sendPresence]);

  // Dopošle naimportovaná data hned po prvním full_state pro tenhle projekt.
  const importedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentProjectId || !state || importedForRef.current === currentProjectId) return;
    importedForRef.current = currentProjectId;
    const pending = takePendingImport(currentProjectId);
    if (!pending) return;

    // Přílohy jdou ven ze stavu a nahrají se zvlášť přes REST (ADR-010).
    // Dokud se posílaly uvnitř `full_state_import`, nešlo o „přílohy chybí" —
    // `ImportedFile` nemá `addedBy`, které je na serveru povinné pole `FileRef`,
    // takže se celý command odmítl na vazbě argumentů a z importovaného ZIPu
    // se nenaimportovalo vůbec nic.
    const { files, ...rest } = pending;

    // `adoConfig: null` by command shodil taky (viz `forImportCommand`).
    dispatch({ type: 'full_state_import', state: forImportCommand({ ...rest, files: [] }) });

    if (files.length > 0) {
      uploadImported(currentProjectId, files).then((failed) => {
        if (failed.length > 0)
          onImportWarning?.(`Tyto přílohy se nepodařilo nahrát: ${failed.join(', ')}`);
      });
    }
  }, [currentProjectId, state, dispatch, onImportWarning]);
}
