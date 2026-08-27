// Soubory projektu (files.feature) — přílohy jsou od ADR-010 uložené jako
// BLOB na serveru; tenhle soubor jen skládá dílčí kusy dohromady (`soubory/`
// adresář), sám nepočítá (CLAUDE.md: „index.tsx skládá, use*.ts počítá").
import type { FileRef } from '../../types';
import type { MemberRole } from '../../types/protocol';
import type { FilesCommand } from '../../hooks/appCommands/useFilesCommand';
import { formatSize } from './soubory/fileHelpers';
import { useFileUpload } from './soubory/useFileUpload';
import { useFilePreview } from './soubory/useFilePreview';
import { useFileActions } from './soubory/useFileActions';
import { FileRow } from './soubory/FileRow';
import { PreviewModal } from './soubory/PreviewModal';

interface SouboryViewProps {
  files: FileRef[];
  /** Potřebuje ho upload — `POST /api/projects/{id}/files` (ADR-010). */
  projectId: string;
  /** Sdružuje `updateFileNote`/`addFileLocally`/`removeFileLocally` (ADR-012: bez toho 4 samostatné funkční propy). */
  fileCommands: FilesCommand;
  /** Mazání je PM-only (files.feature); server ověří znovu, tohle je jen UX (ADR-006). */
  role: MemberRole | null;
  /** FR-OFFLINE-07: upload vyžaduje připojení k serveru. */
  isOffline?: boolean;
}

/** FR-OFFLINE-07: text drop zóny podle stavu — vlastní funkce místo vnořeného ternary (ADR-012). */
function dropZoneLabel(isOffline: boolean, isDragging: boolean): string {
  if (isOffline) return 'Upload souborů vyžaduje připojení';
  if (isDragging) return 'Pusťte soubory zde...';
  return 'Přetáhněte soubory sem nebo klikněte pro výběr';
}

interface FileDropZoneProps {
  upload: ReturnType<typeof useFileUpload>;
  isOffline: boolean;
}

/** `<label>` místo klikacího `<div>`: klik na zónu i Tab + Enter jdou nativně
 * na skrytý input, takže upload není myš-only. */
function FileDropZone({ upload, isOffline }: FileDropZoneProps) {
  return (
    <label
      onDragOver={isOffline ? undefined : upload.handleDragOver}
      onDragLeave={isOffline ? undefined : upload.handleDragLeave}
      onDrop={isOffline ? undefined : upload.handleDrop}
      title={isOffline ? 'Upload souborů vyžaduje připojení' : undefined}
      aria-disabled={isOffline}
      style={{
        border: `2px dashed ${upload.isDragging ? '#4f9cf9' : '#1e2533'}`,
        borderRadius: 10,
        position: 'relative',
        display: 'block',
        padding: '30px 20px',
        marginBottom: 22,
        textAlign: 'center',
        cursor: isOffline ? 'not-allowed' : 'pointer',
        opacity: isOffline ? 0.5 : 1,
        background: upload.isDragging ? '#0c1a2a' : '#0c1018',
        transition: 'all 0.2s',
      }}
    >
      <input
        ref={upload.fileInputRef as React.RefObject<HTMLInputElement>}
        type="file"
        multiple
        disabled={isOffline}
        onChange={upload.handleFileSelect}
        // Ne `display: none` — takový input je i mimo pořadí tabulátoru.
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      />
      <div style={{ fontSize: 32, marginBottom: 10 }}>{upload.isDragging ? '📥' : '📁'}</div>
      <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>
        {dropZoneLabel(isOffline, upload.isDragging)}
      </div>
      <div style={{ color: '#475569', fontSize: 10 }}>
        Soubory jsou uloženy na serveru a sdílené se všemi členy projektu
      </div>
    </label>
  );
}

function UploadErrorBanner({ upload }: { upload: ReturnType<typeof useFileUpload> }) {
  if (!upload.uploadError) return null;
  return (
    <div
      role="alert"
      style={{
        background: '#2a0a0a',
        border: '1px solid #f8717166',
        borderRadius: 8,
        padding: '8px 14px',
        marginBottom: 16,
        fontSize: 11,
        color: '#f87171',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <span>{upload.uploadError}</span>
      <button
        type="button"
        className="btn"
        onClick={upload.dismissUploadError}
        style={{ background: 'transparent', border: 'none', color: '#f87171', padding: 0 }}
      >
        ✕
      </button>
    </div>
  );
}

interface FileListPanelProps {
  files: FileRef[];
  role: MemberRole | null;
  preview: ReturnType<typeof useFilePreview>;
  fileCommands: FilesCommand;
  fileActions: ReturnType<typeof useFileActions>;
}

function FileListPanel({ files, role, preview, fileCommands, fileActions }: FileListPanelProps) {
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div style={{ border: '1px solid #1e2533', borderRadius: 10, overflow: 'hidden' }}>
      <div
        style={{
          background: '#161b27',
          padding: '10px 16px',
          borderBottom: '1px solid #1e2533',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: '#64748b',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Uložené soubory ({files.length})
        </div>
        {files.length > 0 && (
          <div style={{ fontSize: 10, color: '#475569' }}>Celkem: {formatSize(totalSize)}</div>
        )}
      </div>

      {files.length === 0 ? (
        <div style={{ padding: '30px 20px', textAlign: 'center', color: '#334155', fontSize: 11 }}>
          Zatím žádné soubory. Přetáhněte soubory do zóny výše nebo klikněte pro výběr.
        </div>
      ) : (
        <div>
          {files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              role={role}
              actions={{
                onPreview: preview.openPreview,
                onDownload: fileActions.downloadFile,
                onUpdateNote: fileCommands.updateFileNote,
                onDelete: fileActions.deleteFile,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SouboryView({
  files,
  projectId,
  fileCommands,
  role,
  isOffline = false,
}: SouboryViewProps) {
  const upload = useFileUpload(projectId, fileCommands.addFileLocally);
  const preview = useFilePreview();
  const fileActions = useFileActions(fileCommands.removeFileLocally);

  return (
    <div style={{ padding: '20px 28px' }}>
      <PreviewModal preview={preview} onDownload={fileActions.downloadFile} />
      <div
        style={{
          fontSize: 10,
          color: '#64748b',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 18,
        }}
      >
        Soubory projektu
      </div>

      <FileDropZone upload={upload} isOffline={isOffline} />
      <UploadErrorBanner upload={upload} />
      <FileListPanel
        files={files}
        role={role}
        preview={preview}
        fileCommands={fileCommands}
        fileActions={fileActions}
      />
    </div>
  );
}
