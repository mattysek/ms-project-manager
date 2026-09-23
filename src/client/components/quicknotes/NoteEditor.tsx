// Editor jedné poznámky — markdown textarea + preview (FR-QN-04), link na
// projekt (FR-QN-06), konverze na úkol (FR-QN-07), smazání (FR-QN-05).
import { useState } from 'react';
import type { QuickNote } from '../../api/quickNotesApi';
import { QUICK_NOTE_MAX_CHARS } from '../../hooks/useQuickNotes';
import { markdownToHtml } from '../../utils/htmlMarkdownConverter';
import { useNoteEditor } from './useNoteEditor';

interface ProjectOption {
  id: string;
  name: string;
}

interface NoteEditorProps {
  note: QuickNote | null;
  projects: ProjectOption[];
  onCreate: (content: string, linkedProjectId: string | null) => Promise<QuickNote | null>;
  onSave: (
    id: string,
    content: string,
    linkedProjectId: string | null
  ) => Promise<QuickNote | null>;
  onDelete: (id: string) => Promise<void>;
  /**
   * Převod na úkol. Dostává poznámku s obsahem a projektem **z editoru** —
   * autosave může být ještě v běhu a úkol vzniká v projektu poznámky.
   */
  onConvert: (note: QuickNote) => void;
  onPersisted: (note: QuickNote) => void;
  onBack: () => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('cs-CZ')} ${d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`;
}

type Tab = 'edit' | 'preview';

function EditorToolbar({
  tab,
  setTab,
  onBack,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  onBack: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        type="button"
        className="btn"
        onClick={onBack}
        style={{ background: 'transparent', borderColor: '#2d3748', color: '#64748b' }}
      >
        ← Zpět
      </button>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
        {(['edit', 'preview'] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            className="btn"
            style={{
              background: tab === t ? '#0d1f38' : 'transparent',
              borderColor: tab === t ? '#4f9cf944' : '#2d3748',
              color: tab === t ? '#93c5fd' : '#64748b',
              fontSize: 10,
            }}
          >
            {t === 'edit' ? 'Editor' : 'Preview'}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Úkol vzniká v projektu, ke kterému poznámka patří — u nepřiřazené poznámky
 * není kam ho dát, takže převod nejde.
 */
function convertTitle(note: QuickNote | null, linkedProjectId: string | null): string | undefined {
  if (!note || note.convertedToTaskId) return undefined;
  return linkedProjectId ? undefined : 'Přiřaďte poznámku k projektu pro přidání úkolu';
}

function EditorActions({
  note,
  linkedProjectId,
  onDelete,
  onConvert,
}: {
  note: QuickNote | null;
  linkedProjectId: string | null;
  onDelete: () => void;
  onConvert: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {note && (
        <button
          type="button"
          className="btn"
          onClick={onDelete}
          style={{
            background: '#2a0a0a',
            borderColor: '#f8717155',
            color: '#f87171',
            fontSize: 10,
          }}
        >
          Smazat
        </button>
      )}
      <button
        type="button"
        className="btn"
        disabled={!note || !!note.convertedToTaskId || !linkedProjectId}
        onClick={onConvert}
        title={convertTitle(note, linkedProjectId)}
        style={{
          marginLeft: 'auto',
          background: '#0d1f38',
          borderColor: '#4f9cf944',
          color: '#93c5fd',
          fontSize: 10,
        }}
      >
        → Přidat jako úkol
      </button>
    </div>
  );
}

/** Vlastní obsah poznámky — editor/preview, vazba na projekt a časy uložení. */
function NoteBody({
  tab,
  editor,
  projects,
  note,
}: {
  tab: Tab;
  editor: ReturnType<typeof useNoteEditor>;
  projects: ProjectOption[];
  note: QuickNote | null;
}) {
  return (
    <>
      {tab === 'edit' ? (
        <textarea
          className="inp"
          value={editor.content}
          onChange={(e) => editor.setContent(e.target.value)}
          onBlur={editor.flush}
          readOnly={editor.readOnly}
          maxLength={QUICK_NOTE_MAX_CHARS}
          placeholder="Napište poznámku…"
          style={{ flex: 1, minHeight: 160, resize: 'vertical', fontSize: 12, lineHeight: 1.6 }}
        />
      ) : (
        <div
          className="markdown-content"
          style={{ flex: 1, overflowY: 'auto', fontSize: 12, color: '#e2e8f0' }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: markdownToHtml je jediné sanitizované místo (CLAUDE.md)
          dangerouslySetInnerHTML={{ __html: markdownToHtml(editor.content) }}
        />
      )}

      <select
        className="inp"
        aria-label="Přiřadit k projektu"
        value={editor.linkedProjectId ?? ''}
        onChange={(e) => editor.setLinkedProjectId(e.target.value || null)}
        disabled={editor.readOnly}
        style={{ width: '100%' }}
      >
        <option value="">— Nepřiřazeno k projektu —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {note && (
        <div style={{ fontSize: 9, color: '#475569' }}>
          Vytvořeno: {formatTimestamp(note.createdAt)} · Upraveno: {formatTimestamp(note.updatedAt)}
          {editor.savedAt && <span style={{ color: '#34d399', marginLeft: 8 }}>Uloženo</span>}
        </div>
      )}
    </>
  );
}

export function NoteEditor({
  note,
  projects,
  onCreate,
  onSave,
  onDelete,
  onConvert,
  onPersisted,
  onBack,
}: NoteEditorProps) {
  const [tab, setTab] = useState<Tab>('edit');
  const editor = useNoteEditor({ note, onCreate, onSave, onPersisted });

  const handleConvert = () => {
    if (!note) return;
    editor.flush();
    onConvert({ ...note, content: editor.content, linkedProjectId: editor.linkedProjectId });
  };

  const handleDelete = async () => {
    if (!note) return onBack();
    if (!confirm('Opravdu smazat tuto poznámku? Tuto akci nelze vrátit.')) return;
    await onDelete(note.id);
    onBack();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 14px',
        flex: 1,
        overflow: 'hidden',
      }}
    >
      <EditorToolbar tab={tab} setTab={setTab} onBack={onBack} />

      {note?.convertedToTaskId && (
        <div
          style={{
            fontSize: 10,
            color: '#6ee7b7',
            background: '#0d2210',
            border: '1px solid #34d39944',
            borderRadius: 4,
            padding: '4px 8px',
          }}
        >
          → Úkol: {note.content.slice(0, 60)}
        </div>
      )}

      <NoteBody tab={tab} editor={editor} projects={projects} note={note} />

      <EditorActions
        note={note}
        linkedProjectId={editor.linkedProjectId}
        onDelete={handleDelete}
        onConvert={handleConvert}
      />
    </div>
  );
}
