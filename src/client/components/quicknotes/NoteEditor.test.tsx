// Testy NoteEditor — editace, autosave, preview markdownu, konverze na úkol
// (PRD-04, FR-QN-04, FR-QN-07).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteEditor } from './NoteEditor';
import type { QuickNote } from '../../api/quickNotesApi';

function note(overrides: Partial<QuickNote> = {}): QuickNote {
  return {
    id: 'n1',
    content: 'Draft',
    linkedProjectId: null,
    convertedToTaskId: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

function renderEditor(overrides: Partial<Parameters<typeof NoteEditor>[0]> = {}) {
  return render(
    <NoteEditor
      note={note()}
      projects={[]}
      canConvert
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onDelete={vi.fn()}
      onConvert={vi.fn()}
      onPersisted={vi.fn()}
      onBack={vi.fn()}
      {...overrides}
    />
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('NoteEditor', () => {
  // @scenario: quick-notes.feature > Autosave při editaci
  it('po 2 sekundách nečinnosti se poznámka uloží automaticky a zobrazí se "Uloženo"', async () => {
    vi.useFakeTimers();
    const existing = note({ content: 'Draft' });
    const onSave = vi.fn().mockResolvedValue({ ...existing, content: 'Draft upraveno' });
    renderEditor({ note: existing, onSave });

    fireEvent.change(screen.getByPlaceholderText('Napište poznámku…'), {
      target: { value: 'Draft upraveno' },
    });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(onSave).toHaveBeenCalledWith('n1', 'Draft upraveno', null);
    expect(screen.getByText('Uloženo')).toBeInTheDocument();
  });

  // @scenario: quick-notes.feature > Preview markdownu v poznámce
  it('přepnutí na Preview vykreslí formátovaný markdown s nadpisem a položkami seznamu', async () => {
    const md = '## TODO\n\n- [ ] Zkontrolovat testy\n- [ ] Aktualizovat dokumentaci';
    renderEditor({ note: note({ content: md }) });

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.getByRole('heading', { level: 2, name: 'TODO' })).toBeInTheDocument();
    expect(screen.getByText('Zkontrolovat testy')).toBeInTheDocument();
    expect(screen.getByText('Aktualizovat dokumentaci')).toBeInTheDocument();
    // Zobrazuje se vykreslený markdown, ne surový zdrojový text.
    expect(screen.queryByText(/##\s*TODO/)).not.toBeInTheDocument();
  });

  // @scenario: quick-notes.feature > Tlačítko konverze je neaktivní bez otevřeného projektu
  it('tlačítko "→ Přidat jako úkol" je neaktivní, když není otevřený projekt', () => {
    renderEditor({ canConvert: false });

    expect(screen.getByRole('button', { name: '→ Přidat jako úkol' })).toBeDisabled();
  });
});
