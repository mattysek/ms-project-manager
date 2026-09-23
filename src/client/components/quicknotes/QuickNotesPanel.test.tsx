// Testy QuickNotesPanel — přidání, editace, smazání a link na projekt
// (PRD-04, FR-QN-03…06), přes reálný `useQuickNotes` hook s mockovaným REST API.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuickNote } from '../../api/quickNotesApi';
import * as quickNotesApi from '../../api/quickNotesApi';
import { useQuickNotes } from '../../hooks/useQuickNotes';
import { QuickNotesPanel } from './QuickNotesPanel';

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

interface PanelHarnessProps {
  projects?: { id: string; name: string }[];
}

// Vlastní `useQuickNotes` instanci si drží AuthenticatedApp — harness to
// napodobuje, aby test odpovídal skutečnému zapojení komponent.
function PanelHarness({ projects = [] }: PanelHarnessProps) {
  const notes = useQuickNotes();
  const load = notes.load;
  useEffect(() => {
    load();
  }, [load]);
  return (
    <QuickNotesPanel notes={notes} projects={projects} onConvert={vi.fn()} onClose={vi.fn()} />
  );
}

function textareaEl(): HTMLTextAreaElement {
  return screen.getByPlaceholderText('Napište poznámku…') as HTMLTextAreaElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('QuickNotesPanel — přidání a minimální obsah', () => {
  // @scenario: quick-notes.feature > Přidání nové poznámky
  it('nová poznámka se uloží na blur a zobrazí se v seznamu jako první', async () => {
    const existing = note({ id: 'old', content: 'Existující poznámka' });
    const created = note({
      id: 'new-note',
      content: 'Podívat se na PR #156 — nejasná business logika kolem stavů objednávek',
    });
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([existing]);
    vi.spyOn(quickNotesApi, 'createNote').mockResolvedValue(created);
    render(<PanelHarness />);
    await screen.findByText('Existující poznámka');

    await userEvent.click(screen.getByText('+ Nová poznámka'));
    await userEvent.type(textareaEl(), created.content);
    fireEvent.blur(textareaEl());

    // Třetí argument je id vygenerované klientem — poznámka musí mít identitu
    // ještě před dohráním, aby ji šlo offline upravit (offline.feature).
    await waitFor(() =>
      expect(quickNotesApi.createNote).toHaveBeenCalledWith(
        created.content,
        null,
        expect.any(String)
      )
    );
    await userEvent.click(screen.getByText('← Zpět'));

    const newItem = screen.getByText(created.content, { exact: false });
    const oldItem = screen.getByText('Existující poznámka');
    // "jako první (nejnovější nahoře)" — nová položka předchází starou v DOM.
    expect(
      newItem.compareDocumentPosition(oldItem) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  // @scenario: quick-notes.feature > Minimální obsah poznámky
  it('prázdná poznámka se při odchodu z editoru neuloží a tiše zmizí', async () => {
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([]);
    const createSpy = vi.spyOn(quickNotesApi, 'createNote');
    render(<PanelHarness />);
    await screen.findByText('Žádné poznámky');

    await userEvent.click(screen.getByText('+ Nová poznámka'));
    fireEvent.blur(textareaEl());
    await userEvent.click(screen.getByText('← Zpět'));

    expect(createSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Žádné poznámky')).toBeInTheDocument();
  });
});

describe('QuickNotesPanel — editace, smazání, link na projekt', () => {
  // @scenario: quick-notes.feature > Editace existující poznámky
  it('klik na poznámku otevře editor; změna textu a blur ji aktualizuje', async () => {
    const original = note({ id: 'n1', content: 'Podívat se na PR #156' });
    const updatedContent = 'PR #156 — zkontrolováno, schváleno 11.8.2026';
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([original]);
    vi.spyOn(quickNotesApi, 'updateNote').mockResolvedValue({
      ...original,
      content: updatedContent,
    });
    render(<PanelHarness />);

    await userEvent.click(await screen.findByText('Podívat se na PR #156'));
    await userEvent.clear(textareaEl());
    await userEvent.type(textareaEl(), updatedContent);
    fireEvent.blur(textareaEl());

    await waitFor(() =>
      expect(quickNotesApi.updateNote).toHaveBeenCalledWith('n1', {
        content: updatedContent,
        linkedProjectId: null,
        convertedToTaskId: null,
      })
    );
  });

  // @scenario: quick-notes.feature > Smazání poznámky
  it('smazání po potvrzení dialogu poznámku trvale odstraní', async () => {
    const toDelete = note({ id: 'n1', content: 'Zastaralá poznámka' });
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([toDelete]);
    vi.spyOn(quickNotesApi, 'deleteNote').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PanelHarness />);

    await userEvent.click(await screen.findByText('Zastaralá poznámka'));
    await userEvent.click(screen.getByText('Smazat'));

    expect(window.confirm).toHaveBeenCalledWith(
      'Opravdu smazat tuto poznámku? Tuto akci nelze vrátit.'
    );
    await waitFor(() => expect(quickNotesApi.deleteNote).toHaveBeenCalledWith('n1'));
    expect(screen.queryByText('Zastaralá poznámka')).not.toBeInTheDocument();
  });

  // @scenario: quick-notes.feature > Link poznámky na projekt
  it('přiřazení k projektu se uloží a zobrazí jako tag u poznámky v seznamu', async () => {
    const original = note({ id: 'n1', content: 'Implementovat rate limiting' });
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([original]);
    vi.spyOn(quickNotesApi, 'updateNote').mockResolvedValue({ ...original, linkedProjectId: 'p1' });
    render(<PanelHarness projects={[{ id: 'p1', name: 'Backend refaktoring' }]} />);

    await userEvent.click(await screen.findByText('Implementovat rate limiting'));
    await userEvent.selectOptions(
      screen.getByLabelText('Přiřadit k projektu'),
      'Backend refaktoring'
    );
    fireEvent.blur(textareaEl());

    await waitFor(() =>
      expect(quickNotesApi.updateNote).toHaveBeenCalledWith('n1', {
        content: original.content,
        linkedProjectId: 'p1',
        convertedToTaskId: null,
      })
    );
    await userEvent.click(screen.getByText('← Zpět'));
    expect(screen.getByRole('option', { name: 'Backend refaktoring' })).toBeInTheDocument();
    expect(screen.getAllByText('Backend refaktoring')).toHaveLength(2); // filtr + tag u poznámky
  });
});

describe('QuickNotesPanel — převod právě napsané poznámky', () => {
  // @scenario: quick-notes.feature > Právě napsanou poznámku lze hned převést na úkol
  it('po uložení draftu je "→ Přidat jako úkol" aktivní bez opětovného otevření', async () => {
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([]);
    vi.spyOn(quickNotesApi, 'createNote').mockImplementation(async (content, linked, id) =>
      note({ id, content, linkedProjectId: linked })
    );
    render(<PanelHarness projects={[{ id: 'p1', name: 'Backend refaktoring' }]} />);

    await userEvent.click(await screen.findByText('+ Nová poznámka'));
    await userEvent.type(textareaEl(), 'Doplnit audit log');
    fireEvent.change(screen.getByLabelText('Přiřadit k projektu'), { target: { value: 'p1' } });
    const convert = screen.getByRole('button', { name: '→ Přidat jako úkol' });
    expect(convert).toBeDisabled();

    fireEvent.blur(textareaEl());

    await waitFor(() => expect(convert).toBeEnabled());
    // Editor po přijetí id nezahodil text, který v něm byl.
    expect(textareaEl().value).toBe('Doplnit audit log');
  });
});
