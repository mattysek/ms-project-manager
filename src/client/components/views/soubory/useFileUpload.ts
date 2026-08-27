// Upload souborů — file picker i drag-and-drop (files.feature). Skutečný
// přenos jde přes REST (`src/api/filesApi.ts`, ADR-010); po každém úspěšném
// uploadu se `FileRef` metadata přidají lokálně (`addFileLocally`), ať
// uživatel nečeká na SignalR round-trip vlastní akce.
import { useCallback, useRef, useState } from 'react';
import { uploadFile } from '../../../api/filesApi';
import type { FileRef } from '../../../types';

export interface UseFileUploadResult {
  isDragging: boolean;
  uploadError: string | null;
  dismissUploadError: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  openFilePicker: () => void;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Nahrání souboru selhalo.';
}

/**
 * Sekvenční upload (ne paralelní) — `files.feature` „Upload více souborů
 * najednou" vyžaduje, aby pořadí v seznamu odpovídalo pořadí uploadu.
 */
async function uploadSequentially(
  projectId: string,
  files: File[],
  onUploaded: (file: FileRef) => void,
  onError: (message: string) => void
): Promise<void> {
  for (const file of files) {
    try {
      const uploaded = await uploadFile(projectId, file);
      onUploaded(uploaded.file);
    } catch (err) {
      onError(errorText(err));
    }
  }
}

export function useFileUpload(
  projectId: string,
  addFileLocally: (file: FileRef) => void
): UseFileUploadResult {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      setUploadError(null);
      void uploadSequentially(projectId, Array.from(fileList), addFileLocally, setUploadError);
    },
    [projectId, addFileLocally]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
      e.target.value = '';
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  return {
    isDragging,
    uploadError,
    dismissUploadError: useCallback(() => setUploadError(null), []),
    fileInputRef,
    openFilePicker: useCallback(() => fileInputRef.current?.click(), []),
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
