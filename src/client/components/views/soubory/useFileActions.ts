// Stažení a mazání souboru — obojí REST (ADR-010, `src/api/filesApi.ts`).
// Mazání se ptá na potvrzení (files.feature „Smazání souboru (PM)") a smí ho
// spustit jen ten, kdo vidí tlačítko — server oprávnění ověří znovu.
import { useCallback } from 'react';
import { deleteFile as deleteFileApi, fetchFileBlob, FilesApiError } from '../../../api/filesApi';
import type { FileRef } from '../../../types';

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof FilesApiError && err.message ? err.message : fallback;
}

async function triggerBrowserDownload(file: FileRef): Promise<void> {
  const blob = await fetchFileBlob(file.id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

export interface UseFileActionsResult {
  downloadFile: (file: FileRef) => Promise<void>;
  deleteFile: (file: FileRef) => Promise<void>;
}

export function useFileActions(removeFileLocally: (fileId: string) => void): UseFileActionsResult {
  const downloadFile = useCallback(async (file: FileRef) => {
    try {
      await triggerBrowserDownload(file);
    } catch (err) {
      alert(apiErrorMessage(err, 'Stažení souboru selhalo.'));
    }
  }, []);

  const deleteFile = useCallback(
    async (file: FileRef) => {
      if (!window.confirm(`Opravdu smazat soubor ${file.name}?`)) return;
      try {
        await deleteFileApi(file.id);
        removeFileLocally(file.id);
      } catch (err) {
        alert(apiErrorMessage(err, 'Smazání souboru selhalo.'));
      }
    },
    [removeFileLocally]
  );

  return { downloadFile, deleteFile };
}
