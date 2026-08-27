// Testy konverze poznámky na úkol (PRD-04, FR-QN-07) — `useNoteConversion` +
// `QuickNoteConversionModal` + reálný `TaskDetailModal`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { QuickNotesPanel } from './QuickNotesPanel';
import { useNoteConversion } from './useNoteConversion';
import { useQuickNotes } from '../../hooks/useQuickNotes';
import { useProjectDerivedData } from '../../hooks/useProjectDerivedData';
import { INIT_CATS, INIT_PROJECT, INIT_ROLES } from '../../constants';
import * as quickNotesApi from '../../api/quickNotesApi';
import type { QuickNote } from '../../api/quickNotesApi';
import type { AppState } from '../../state/appState';
import type { Task } from '../../types';

function note(overrides: Partial<QuickNote> = {}): QuickNote {
  return {
    id: 'n1',
    content: 'Implementovat rate limiting pro API endpoint /users',
    linkedProjectId: null,
    convertedToTaskId: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

const FAKE_STATE: AppState = {
  project: INIT_PROJECT,
  people: [],
  tasks: [],
  cats: INIT_CATS,
  roles: INIT_ROLES,
  risks: [],
  opps: [],
  reminders: [],
  todos: [],
  kbPages: [],
  files: [],
  adoConfig: null,
  adoSyncLog: [],
};

interface HarnessProps {
  onCreated: (task: Task) => void;
}

function ConversionHarness({ onCreated }: HarnessProps) {
  const notes = useQuickNotes();
  const load = notes.load;
  useEffect(() => {
    load();
  }, [load]);
  const derived = useProjectDerivedData(INIT_PROJECT, [], []);
  const conversion = useNoteConversion({ notes, state: FAKE_STATE, derived, onCreated });
  return (
    <>
      <QuickNotesPanel
        notes={notes}
        projects={[]}
        canConvert
        onConvert={conversion.requestConvert}
        onClose={vi.fn()}
      />
      {conversion.modal}
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Konverze poznámky na úkol', () => {
  // @scenario: quick-notes.feature > Konverze poznámky na úkol
  it('otevře TaskDetailModal s předvyplněným Názvem, Popisem, backlogem a 1 MD', async () => {
    const original = note();
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([original]);
    render(<ConversionHarness onCreated={vi.fn()} />);

    await userEvent.click(await screen.findByText(original.content, { exact: false }));
    await userEvent.click(screen.getByRole('button', { name: '→ Přidat jako úkol' }));

    expect(await screen.findByText('Detail úkolu')).toBeInTheDocument();
    // Poznámka v pozadí má stejný obsah v textaree — vybereme konkrétně <input> (Název úkolu).
    const nameFields = screen.getAllByDisplayValue(original.content);
    expect(nameFields.some((el) => el.tagName === 'INPUT')).toBe(true);
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    const numberInputs = screen.getAllByRole('spinbutton');
    expect(numberInputs[2]).toHaveValue(1); // MD
  });

  // @scenario: quick-notes.feature > Konverze poznámky na úkol
  it('po uložení je úkol vytvořen a poznámka je označena jako konvertovaná (read-only)', async () => {
    const original = note();
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([original]);
    vi.spyOn(quickNotesApi, 'updateNote').mockImplementation(async (_id, fields) => ({
      ...original,
      ...fields,
    }));
    const onCreated = vi.fn();
    render(<ConversionHarness onCreated={onCreated} />);

    await userEvent.click(await screen.findByText(original.content, { exact: false }));
    await userEvent.click(screen.getByRole('button', { name: '→ Přidat jako úkol' }));
    await screen.findByText('Detail úkolu');
    const mdInput = screen.getAllByRole('spinbutton')[2];
    fireEvent.change(mdInput, { target: { value: '3' } });
    await userEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));

    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ name: original.content, md: 3 })
    );
    await waitFor(() =>
      expect(quickNotesApi.updateNote).toHaveBeenCalledWith(
        'n1',
        expect.objectContaining({ convertedToTaskId: expect.any(String) })
      )
    );
    expect(screen.getByText(/→ Úkol: Implementovat rate limiting/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '→ Přidat jako úkol' })).toBeDisabled();
  });
});
