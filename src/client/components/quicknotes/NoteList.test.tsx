// Testy NoteList — filtr dle projektu a fulltext vyhledávání se zvýrazněním
// (PRD-04, FR-QN-02, FR-QN-06).
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { NoteList } from './NoteList';
import type { QuickNote } from '../../api/quickNotesApi';

function note(overrides: Partial<QuickNote> = {}): QuickNote {
  return {
    id: 'n1',
    content: 'Poznámka',
    linkedProjectId: null,
    convertedToTaskId: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

interface ListHarnessProps {
  notes: QuickNote[];
  projects: { id: string; name: string }[];
}

// NoteList je řízená komponenta (query/projectFilter jsou props) — harness
// jen drží lokální stav, stejně jako `QuickNotesPanel` v produkčním kódu.
function ListHarness({ notes, projects }: ListHarnessProps) {
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  return (
    <NoteList
      notes={notes}
      query={query}
      onQueryChange={setQuery}
      projects={projects}
      projectFilter={projectFilter}
      onProjectFilterChange={setProjectFilter}
      onSelect={vi.fn()}
      onCreateDraft={vi.fn()}
    />
  );
}

describe('NoteList', () => {
  // @scenario: quick-notes.feature > Filtrování poznámek dle projektu
  it('filtr dle projektu zobrazí jen poznámky linkované na vybraný projekt', async () => {
    const projects = [{ id: 'p1', name: 'Backend refaktoring' }];
    const notes = [
      note({ id: 'a', content: 'Linked A', linkedProjectId: 'p1' }),
      note({ id: 'b', content: 'Linked B', linkedProjectId: 'p1' }),
      note({ id: 'c', content: 'Linked C', linkedProjectId: 'p1' }),
      note({ id: 'd', content: 'Unlinked D', linkedProjectId: null }),
      note({ id: 'e', content: 'Unlinked E', linkedProjectId: null }),
    ];
    render(<ListHarness notes={notes} projects={projects} />);
    expect(screen.getAllByText(/^Linked|^Unlinked/)).toHaveLength(5);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'Backend refaktoring');

    expect(screen.getAllByText(/^Linked/)).toHaveLength(3);
    expect(screen.queryByText(/^Unlinked/)).not.toBeInTheDocument();
  });

  // @scenario: quick-notes.feature > Fulltext vyhledávání v poznámkách
  it('fulltext hledání filtruje poznámky a zvýrazní hledaný výraz', async () => {
    const notes = [
      note({ id: '1', content: 'Implementovat rate limiting pro API' }),
      note({ id: '2', content: 'Zkontrolovat rate limiting testy' }),
      note({ id: '3', content: 'Nákup kávy' }),
      note({ id: '4', content: 'Refaktoring modulu X' }),
      note({ id: '5', content: 'Review PR' }),
    ];
    render(<ListHarness notes={notes} projects={[]} />);

    await userEvent.type(screen.getByPlaceholderText('Hledat…'), 'rate limiting');

    expect(screen.getByText('Implementovat', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Zkontrolovat', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/Nákup kávy/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Refaktoring modulu X/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Review PR/)).not.toBeInTheDocument();
    const highlighted = screen.getAllByText('rate limiting', { selector: 'mark' });
    expect(highlighted).toHaveLength(2);
  });

  // @scenario: quick-notes.feature > Varování při blížícím se limitu poznámek
  it('zobrazí varování při 400 a více poznámkách, ne dřív', () => {
    const notes399 = Array.from({ length: 399 }, (_, i) => note({ id: `n${i}` }));
    const { rerender } = render(<ListHarness notes={notes399} projects={[]} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const notes400 = Array.from({ length: 400 }, (_, i) => note({ id: `n${i}` }));
    rerender(<ListHarness notes={notes400} projects={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('400 z 500 poznámek');
  });
});
