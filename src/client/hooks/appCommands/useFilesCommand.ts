import { useCallback } from 'react';
import type { FileRef } from '../../types';
import type { AppState } from '../../state/appState';
import type { AppCommandsDeps } from './types';

export interface FilesCommand {
  /** Editace poznámky jde běžným command kanálem (ADR-004) — je to text, ne BLOB. */
  updateFileNote: (fileId: string, note: string) => void;
  /**
   * Přidání/odebrání do lokálního stavu HNED po úspěšném REST volání
   * (`SouboryView` volá `src/api/filesApi.ts` přímo — ADR-010, `add_file`/
   * `delete_file` jsou commandy, které si posílá server sám, klient je
   * neposílá). Bez tohohle by uživatel čekal na SignalR round-trip vlastního
   * uploadu/mazání, což ADR-004 („Optimistická aplikace") nechce.
   *
   * Obě mutace jsou idempotentní vůči následnému `file_added`/`file_deleted`
   * diffu, který dorazí i odesílateli (broadcast celé skupině) —
   * `applyDiff.ts` duplicitní přidání ignoruje, smazání už z podstaty
   * `filter` idempotentní je.
   */
  addFileLocally: (file: FileRef) => void;
  removeFileLocally: (fileId: string) => void;
}

export function useFilesCommand({ dispatch, applyLocal }: FilesCommandDeps): FilesCommand {
  const updateFileNote = useCallback(
    (fileId: string, note: string) => {
      dispatch({ type: 'update_file_note', fileId, note });
    },
    [dispatch]
  );

  const addFileLocally = useCallback(
    (file: FileRef) => {
      applyLocal((state) =>
        state.files.some((f) => f.id === file.id)
          ? state
          : { ...state, files: [...state.files, file] }
      );
    },
    [applyLocal]
  );

  const removeFileLocally = useCallback(
    (fileId: string) => {
      applyLocal((state) => ({ ...state, files: state.files.filter((f) => f.id !== fileId) }));
    },
    [applyLocal]
  );

  return { updateFileNote, addFileLocally, removeFileLocally };
}

interface FilesCommandDeps extends Pick<AppCommandsDeps, 'dispatch'> {
  applyLocal: (mutate: (state: AppState) => AppState) => void;
}
