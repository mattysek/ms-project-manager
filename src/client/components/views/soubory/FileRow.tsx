// Jeden řádek seznamu souborů — ikona, metadata, poznámka (inline editace) a
// akce. Mazání je PM-only (files.feature „Dev nemůže smazat soubor") —
// vynucuje server, tady je to jen `PermissionGate` kosmetika (ADR-006).
import { useState } from 'react';
import { PermissionGate } from '../../PermissionGate';
import { canPreview, formatDate, formatSize, getFileIcon } from './fileHelpers';
import type { FileRef } from '../../../types';
import type { MemberRole } from '../../../types/protocol';

export interface FileRowActions {
  onPreview: (file: FileRef) => void;
  onDownload: (file: FileRef) => void;
  onUpdateNote: (fileId: string, note: string) => void;
  onDelete: (file: FileRef) => void;
}

interface FileRowProps {
  file: FileRef;
  role: MemberRole | null;
  actions: FileRowActions;
}

const ACTION_BTN = { padding: '4px 10px', fontSize: 10 } as const;

function NoteEditor({
  note,
  onSave,
  onCancel,
}: {
  note: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(note);
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      <input
        className="inp"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Poznámka..."
        style={{ flex: 1, fontSize: 10 }}
        // biome-ignore lint/a11y/noAutofocus: uživatel právě otevřel editaci jediné poznámky
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(value.trim());
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button
        type="button"
        className="btn"
        onClick={() => onSave(value.trim())}
        style={{
          background: '#0d2210',
          borderColor: '#34d39966',
          color: '#6ee7b7',
          padding: '2px 8px',
          fontSize: 10,
        }}
      >
        ✓
      </button>
      <button
        type="button"
        className="btn"
        onClick={onCancel}
        style={{
          background: '#1a1a1a',
          borderColor: '#333',
          color: '#666',
          padding: '2px 8px',
          fontSize: 10,
        }}
      >
        ✕
      </button>
    </div>
  );
}

interface FileMetaProps {
  file: FileRef;
  isEditingNote: boolean;
  onSaveNote: (note: string) => void;
  onCancelEdit: () => void;
}

function FileMeta({ file, isEditingNote, onSaveNote, onCancelEdit }: FileMetaProps) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#f1f5f9',
          marginBottom: 3,
          wordBreak: 'break-all',
        }}
      >
        {file.name}
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, display: 'flex', gap: 12 }}>
        <span>{formatSize(file.size)}</span>
        <span style={{ color: '#475569' }}>{file.mimeType}</span>
      </div>
      {isEditingNote ? (
        <NoteEditor note={file.note} onSave={onSaveNote} onCancel={onCancelEdit} />
      ) : (
        file.note && (
          <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>{file.note}</div>
        )
      )}
      <div style={{ fontSize: 9, color: '#334155', marginTop: 4 }}>
        Přidáno: {formatDate(file.addedAt)}
      </div>
    </div>
  );
}

interface FileRowButtonsProps {
  file: FileRef;
  role: MemberRole | null;
  actions: FileRowActions;
  onEditNote: () => void;
}

function FileRowButtons({ file, role, actions, onEditNote }: FileRowButtonsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        flexShrink: 0,
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
      }}
    >
      {canPreview(file) && (
        <button
          type="button"
          className="btn"
          onClick={() => actions.onPreview(file)}
          style={{
            ...ACTION_BTN,
            background: '#0d2210',
            borderColor: '#34d39966',
            color: '#6ee7b7',
          }}
          title="Zobrazit náhled"
        >
          ⬚ Zobrazit
        </button>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => actions.onDownload(file)}
        style={{ ...ACTION_BTN, background: '#0c1a2a', borderColor: '#4f9cf944', color: '#93c5fd' }}
        title="Stáhnout soubor"
      >
        ↓ Stáhnout
      </button>
      <button
        type="button"
        className="btn"
        onClick={onEditNote}
        style={{
          ...ACTION_BTN,
          background: 'transparent',
          border: '1px solid #2d3748',
          color: '#475569',
        }}
        title="Upravit poznámku"
      >
        ✎
      </button>
      <PermissionGate role={role} require="pm">
        <button
          type="button"
          className="btn"
          onClick={() => actions.onDelete(file)}
          style={{
            ...ACTION_BTN,
            background: '#2a1010',
            borderColor: '#f8717144',
            color: '#f87171',
          }}
          title="Smazat"
        >
          ✕
        </button>
      </PermissionGate>
    </div>
  );
}

export function FileRow({ file, role, actions }: FileRowProps) {
  const [isEditingNote, setIsEditingNote] = useState(false);

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #1e253366',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>
        {getFileIcon(file.mimeType, file.name)}
      </div>
      <FileMeta
        file={file}
        isEditingNote={isEditingNote}
        onSaveNote={(note) => {
          actions.onUpdateNote(file.id, note);
          setIsEditingNote(false);
        }}
        onCancelEdit={() => setIsEditingNote(false)}
      />
      <FileRowButtons
        file={file}
        role={role}
        actions={actions}
        onEditNote={() => setIsEditingNote(true)}
      />
    </div>
  );
}
