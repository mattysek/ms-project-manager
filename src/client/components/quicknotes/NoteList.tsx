// Seznam poznámek — fulltext filtr, filtr dle projektu (FR-QN-02, FR-QN-06).
import type { QuickNote } from '../../api/quickNotesApi';
import { QUICK_NOTES_MAX, QUICK_NOTES_WARN_AT } from '../../hooks/useQuickNotes';
import { highlightMatch } from './highlightMatch';

interface ProjectOption {
  id: string;
  name: string;
}

interface NoteListProps {
  notes: QuickNote[];
  query: string;
  onQueryChange: (value: string) => void;
  projects: ProjectOption[];
  projectFilter: string;
  onProjectFilterChange: (value: string) => void;
  onSelect: (note: QuickNote) => void;
  onCreateDraft: () => void;
}

function firstLine(content: string): string {
  return content.split('\n')[0].slice(0, 120);
}

const CHIP: React.CSSProperties = { fontSize: 9, borderRadius: 4, padding: '1px 6px' };

/** Jedna položka seznamu — úryvek textu se zvýrazněnou shodou a štítky. */
function NoteListItem({
  note,
  query,
  project,
  onSelect,
}: {
  note: QuickNote;
  query: string;
  project: ProjectOption | undefined;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        font: 'inherit',
        cursor: 'pointer',
        border: '1px solid #1e2533',
        borderRadius: 6,
        padding: '8px 10px',
        background: '#0c1018',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: '#e2e8f0',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {highlightMatch(firstLine(note.content) || '(prázdné)', query)}
      </div>
      <div
        style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <span style={{ fontSize: 9, color: '#475569' }}>
          {new Date(note.updatedAt).toLocaleDateString('cs-CZ')}
        </span>
        {project && (
          <span
            style={{
              ...CHIP,
              color: '#93c5fd',
              background: '#0d1f38',
              border: '1px solid #4f9cf944',
            }}
          >
            {project.name}
          </span>
        )}
        {note.convertedToTaskId && (
          <span
            style={{
              ...CHIP,
              color: '#6ee7b7',
              background: '#0d2210',
              border: '1px solid #34d39944',
            }}
          >
            → Úkol
          </span>
        )}
      </div>
    </button>
  );
}

/** Filtry nad seznamem — fulltext a volba projektu. */
function ListFilters({
  query,
  onQueryChange,
  projects,
  projectFilter,
  onProjectFilterChange,
}: Pick<
  NoteListProps,
  'query' | 'onQueryChange' | 'projects' | 'projectFilter' | 'onProjectFilterChange'
>) {
  return (
    <>
      <input
        className="inp"
        placeholder="Hledat…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        style={{ width: '100%' }}
      />
      {projects.length > 0 && (
        <select
          className="inp"
          value={projectFilter}
          onChange={(e) => onProjectFilterChange(e.target.value)}
          style={{ width: '100%' }}
        >
          <option value="">Všechny projekty</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

export function NoteList({
  notes,
  query,
  onQueryChange,
  projects,
  projectFilter,
  onProjectFilterChange,
  onSelect,
  onCreateDraft,
}: NoteListProps) {
  const filtered = notes
    .filter((n) => !projectFilter || n.linkedProjectId === projectFilter)
    .filter((n) => !query.trim() || n.content.toLowerCase().includes(query.toLowerCase()));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 14px',
        flex: 1,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        className="btn"
        onClick={onCreateDraft}
        style={{ background: '#0d2210', borderColor: '#34d39966', color: '#6ee7b7', fontSize: 11 }}
      >
        + Nová poznámka
      </button>
      {notes.length >= QUICK_NOTES_WARN_AT && (
        <div
          role="alert"
          style={{
            fontSize: 10,
            color: '#fbbf24',
            background: '#2a1f0a',
            border: '1px solid #f59e0b44',
            borderRadius: 6,
            padding: '6px 8px',
          }}
        >
          Máte {notes.length} z {QUICK_NOTES_MAX} poznámek — blížíte se limitu.
        </div>
      )}
      <ListFilters
        query={query}
        onQueryChange={onQueryChange}
        projects={projects}
        projectFilter={projectFilter}
        onProjectFilterChange={onProjectFilterChange}
      />
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.length === 0 && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', padding: 20 }}>
            Žádné poznámky
          </div>
        )}
        {filtered.map((note) => (
          <NoteListItem
            key={note.id}
            note={note}
            query={query}
            project={projects.find((p) => p.id === note.linkedProjectId)}
            onSelect={() => onSelect(note)}
          />
        ))}
      </div>
    </div>
  );
}
