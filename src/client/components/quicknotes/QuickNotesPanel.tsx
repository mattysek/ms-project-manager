// Floating sidebar vpravo — FR-QN-01. Skládá seznam a editor; sám neřeší
// persistenci (to `useQuickNotes`/`useNoteEditor`), jen výběr aktivní poznámky.
import { useState, type ReactNode } from 'react';
import type { QuickNote } from '../../api/quickNotesApi';
import type { UseQuickNotesResult } from '../../hooks/useQuickNotes';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';
import { FloatingPanel } from '../FloatingPanel';

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
    <FloatingPanel
      label="Quick Notes"
      title="📝 Moje poznámky"
      closeLabel="Zavřít poznámky"
      headerExtra={<PendingBadge count={notes.pendingCount} />}
      onClose={onClose}
    >
      <PanelBody
        notes={notes}
        projects={projects}
        canConvert={canConvert}
        onConvert={onConvert}
        selection={selection}
        setSelection={setSelection}
      />
    </FloatingPanel>
  );
}
