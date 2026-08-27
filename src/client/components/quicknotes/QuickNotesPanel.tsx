// Floating sidebar vpravo — FR-QN-01. Skládá seznam a editor; sám neřeší
// persistenci (to `useQuickNotes`/`useNoteEditor`), jen výběr aktivní poznámky.
import { useState, type ReactNode } from 'react';
import type { QuickNote } from '../../api/quickNotesApi';
import type { UseQuickNotesResult } from '../../hooks/useQuickNotes';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';
import { LAYERS } from '../../constants/layers';

interface ProjectOption {
  id: string;
  name: string;
}

interface QuickNotesPanelProps {
  notes: UseQuickNotesResult;
  projects: ProjectOption[];
  canConvert: boolean;
  onConvert: (note: QuickNote) => void;
  onClose: () => void;
}

type Selection = { kind: 'list' } | { kind: 'draft' } | { kind: 'note'; id: string };

/** Kolik poznámek čeká na dohrání — jinak by offline zápis vypadal jako ztráta. */
function PendingBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count === 1 ? '1 čekající poznámka' : `${count} čekajících poznámek`;
  return (
    <span
      style={{
        marginLeft: 8,
        padding: '1px 7px',
        fontSize: 9,
        borderRadius: 8,
        background: '#2a2010',
        border: '1px solid #fbbf2455',
        color: '#fcd34d',
      }}
    >
      {label}
    </span>
  );
}

function PanelHeader({ onClose, pendingCount }: { onClose: () => void; pendingCount: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 14px',
        borderBottom: '1px solid #1e2533',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Moje poznámky</span>
      <PendingBadge count={pendingCount} />
      <button
        type="button"
        onClick={onClose}
        aria-label="Zavřít poznámky"
        style={{
          marginLeft: 'auto',
          background: 'none',
          border: 'none',
          color: '#64748b',
          cursor: 'pointer',
          fontSize: 16,
        }}
      >
        ×
      </button>
    </div>
  );
}

/** Tři stavy panelu (načítání / seznam / editor) — bez vnořeného ternárního výrazu. */
function PanelBody({
  notes,
  projects,
  canConvert,
  onConvert,
  selection,
  setSelection,
}: Omit<QuickNotesPanelProps, 'onClose'> & {
  selection: Selection;
  setSelection: (s: Selection) => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  if (notes.loading && !notes.loaded) {
    return <div style={{ padding: 20, color: '#475569', fontSize: 11 }}>Načítám…</div>;
  }
  if (selection.kind === 'list') {
    return (
      <NoteList
        notes={notes.notes}
        query={query}
        onQueryChange={setQuery}
        projects={projects}
        projectFilter={projectFilter}
        onProjectFilterChange={setProjectFilter}
        onSelect={(note) => setSelection({ kind: 'note', id: note.id })}
        onCreateDraft={() => setSelection({ kind: 'draft' })}
      />
    );
  }
  return (
    <NoteEditor
      note={
        selection.kind === 'note' ? (notes.notes.find((n) => n.id === selection.id) ?? null) : null
      }
      projects={projects}
      canConvert={canConvert}
      onCreate={notes.createNote}
      onSave={notes.saveNote}
      onDelete={notes.deleteNote}
      onConvert={onConvert}
      onPersisted={() => {}}
      onBack={() => setSelection({ kind: 'list' })}
    />
  );
}

export function QuickNotesPanel({
  notes,
  projects,
  canConvert,
  onConvert,
  onClose,
}: QuickNotesPanelProps) {
  const [selection, setSelection] = useState<Selection>({ kind: 'list' });

  return (
    <div
      role="dialog"
      aria-label="Quick Notes"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        background: '#0f1117',
        borderLeft: '1px solid #1e2533',
        zIndex: LAYERS.quickNotes,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 24px rgba(0,0,0,.4)',
      }}
    >
      <PanelHeader onClose={onClose} pendingCount={notes.pendingCount} />
      <PanelBody
        notes={notes}
        projects={projects}
        canConvert={canConvert}
        onConvert={onConvert}
        selection={selection}
        setSelection={setSelection}
      />
    </div>
  );
}
