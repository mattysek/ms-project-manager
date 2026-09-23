// Testy konverze poznámky na úkol (PRD-04, FR-QN-07) — `useNoteConversion` +
// `QuickNoteConversionModal` + reálný `TaskDetailModal`.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuickNote } from '../../api/quickNotesApi';
import * as quickNotesApi from '../../api/quickNotesApi';
import { INIT_CATS, INIT_PROJECT, INIT_ROLES } from '../../constants';
import { useProjectDerivedData } from '../../hooks/useProjectDerivedData';
import { useQuickNotes } from '../../hooks/useQuickNotes';
import type { AppState } from '../../state/appState';
import type { Person, Task } from '../../types';
import type { MemberRole } from '../../types/protocol';
import { QuickNotesPanel } from './QuickNotesPanel';
import { useNoteConversion } from './useNoteConversion';

function note(overrides: Partial<QuickNote> = {}): QuickNote {
  return {
    id: 'n1',
    content: 'Implementovat rate limiting pro API endpoint /users',
    linkedProjectId: 'p1',
    convertedToTaskId: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

function person(id: string, name: string, userId: string | null): Person {
  return { id, name, role: 'dev', color: '#fff', weekAlloc: [], userId };
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
  onCreated?: (task: Task) => void;
  openProjectTasks?: (projectId: string) => void;
  focusTask?: (taskId: string) => void;
  initialProjectId?: string | null;
  memberRole?: MemberRole;
  people?: Person[];
}

/**
 * Napodobuje `AuthenticatedApp`: otevření projektu přepne `currentProjectId`
 * a stav je k dispozici jen s otevřeným projektem (po přepnutí je `null`).
 */
function ConversionHarness({
  onCreated = vi.fn(),
  openProjectTasks = vi.fn(),
  focusTask = vi.fn(),
  initialProjectId = 'p1',
  memberRole = 'pm',
  people = [],
}: HarnessProps) {
  const notes = useQuickNotes();
  const load = notes.load;
  useEffect(() => {
    load();
  }, [load]);
  const [currentProjectId, setCurrentProjectId] = useState(initialProjectId);
  const derived = useProjectDerivedData(INIT_PROJECT, [], people);
  const conversion = useNoteConversion({
    notes,
    state: currentProjectId ? FAKE_STATE : null,
    derived,
    currentProjectId,
    viewer: { role: memberRole, userId: 'u-petra' },
    openProjectTasks: (id) => {
      openProjectTasks(id);
      setCurrentProjectId(id);
    },
    focusTask,
    onCreated,
  });
  return (
    <>
      <QuickNotesPanel
        notes={notes}
        projects={[
          { id: 'p1', name: 'Backend refaktoring' },
          { id: 'p2', name: 'Frontend redesign' },
        ]}
        onConvert={conversion.requestConvert}
        onClose={vi.fn()}
      />
      {conversion.modal}
    </>
  );
}

async function startConversion(content: string) {
  await userEvent.click(await screen.findByText(content, { exact: false }));
  await userEvent.click(screen.getByRole('button', { name: '→ Přidat jako úkol' }));
  await screen.findByText('Detail úkolu');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Konverze poznámky na úkol', () => {
  // @scenario: quick-notes.feature > Konverze poznámky na úkol
  it('otevře TaskDetailModal s předvyplněným Názvem, Popisem, backlogem a 1 MD', async () => {
    const original = note();
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([original]);
    render(<ConversionHarness />);

    await startConversion(original.content);

    // Poznámka v pozadí má stejný obsah v textaree — vybereme konkrétně <input> (Název úkolu).
    const nameFields = screen.getAllByDisplayValue(original.content);
    expect(nameFields.some((el) => el.tagName === 'INPUT')).toBe(true);
    expect(screen.getByText('— Backlog —')).toBeInTheDocument();
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

    await startConversion(original.content);
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

  // @scenario: quick-notes.feature > Konverze otevře úkol v projektu poznámky
  it('otevře projekt poznámky na Úkolech a po uložení rozbalí detail nového úkolu', async () => {
    const original = note({ content: 'Doplnit audit log', linkedProjectId: 'p2' });
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([original]);
    vi.spyOn(quickNotesApi, 'updateNote').mockImplementation(async (_id, fields) => ({
      ...original,
      ...fields,
    }));
    const openProjectTasks = vi.fn();
    const focusTask = vi.fn();
    const onCreated = vi.fn();
    render(
      <ConversionHarness
        initialProjectId={null}
        openProjectTasks={openProjectTasks}
        focusTask={focusTask}
        onCreated={onCreated}
      />
    );

    await startConversion(original.content);
    expect(openProjectTasks).toHaveBeenCalledWith('p2');

    await userEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));

    const created = onCreated.mock.calls[0][0] as Task;
    expect(created.name).toBe('Doplnit audit log');
    expect(focusTask).toHaveBeenCalledWith(created.id);
  });

  it('formulář přežije překreslení rodiče — koncept se neresetuje', async () => {
    const original = note();
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([original]);
    const { rerender } = render(<ConversionHarness />);

    await startConversion(original.content);
    const mdInput = screen.getAllByRole('spinbutton')[2];
    fireEvent.change(mdInput, { target: { value: '5' } });
    rerender(<ConversionHarness />);

    expect(screen.getAllByRole('spinbutton')[2]).toHaveValue(5);
  });

  // @scenario: quick-notes.feature > Dev smí úkol z poznámky přiřadit jen sobě nebo do backlogu
  it('Devovi nabídne k přiřazení jen backlog a vlastní osobu', async () => {
    const original = note();
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([original]);
    render(
      <ConversionHarness
        memberRole="dev"
        people={[person('a', 'Petra', 'u-petra'), person('b', 'Jan', 'u-jan')]}
      />
    );

    await startConversion(original.content);

    const options = within(screen.getByLabelText('Přiřazeno')).getAllByRole('option');
    expect(options.map((o) => o.textContent?.trim())).toEqual(['— Backlog —', 'Petra']);
  });
});
