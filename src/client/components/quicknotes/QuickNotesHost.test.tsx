// Testy QuickNotesHost — přístup k panelu z hlavičky, nezávisle na view/projektu
// (PRD-04, FR-QN-01).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { QuickNotesHost } from './QuickNotesHost';
import { useQuickNotes } from '../../hooks/useQuickNotes';
import * as quickNotesApi from '../../api/quickNotesApi';
import * as projectsApi from '../../api/projectsApi';
import type { QuickNote } from '../../api/quickNotesApi';
import type { ProjectSummary } from '../../api/projectsApi';

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

function projectSummary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 'p1',
    name: 'Backend refaktoring',
    startDate: '2026-01-01',
    endDate: '2026-06-01',
    budget: 100,
    peopleCount: 1,
    taskCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Sama komponenta žádné vlastní props nemá — data (`useQuickNotes`) si drží
// stejně jako AuthenticatedApp, aby test odpovídal skutečnému zapojení.
function Harness({ activeProjectId = 'p1' as string | null } = {}) {
  const notes = useQuickNotes();
  return <QuickNotesHost notes={notes} activeProjectId={activeProjectId} onConvert={vi.fn()} />;
}

// Ověřuje FR-QN-01 „dostupný na všech views" — QuickNotesHost nezávisí na
// aktuálním view, simulujeme přepnutí záložky vedlejším stavem.
function ViewSwitchHarness() {
  const [activeView, setActiveView] = useState('gantt');
  const notes = useQuickNotes();
  return (
    <div>
      <div data-testid="active-view">{activeView}</div>
      <button type="button" onClick={() => setActiveView('ukoly')}>
        Přepnout na Úkoly
      </button>
      <QuickNotesHost notes={notes} activeProjectId="p1" onConvert={vi.fn()} />
    </div>
  );
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('QuickNotesHost', () => {
  // @scenario: quick-notes.feature > Otevření Quick Notes panelu
  it('klik na ikonu "📝 Poznámky" otevře panel jako pravostranný sidebar s nadpisem "Moje poznámky"', async () => {
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([]);
    vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([]);
    render(
      <div>
        <div data-testid="view-content">Harmonogram projektu</div>
        <Harness />
      </div>
    );
    expect(screen.queryByRole('dialog', { name: 'Quick Notes' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /📝 Poznámky/ }));

    const panel = await screen.findByRole('dialog', { name: 'Quick Notes' });
    expect(panel).toHaveTextContent('Moje poznámky');
    expect(panel.style.position).toBe('fixed');
    expect(panel.style.right).toBe('0px');
    // Zbytek stránky (aktuální view) zůstává beze změny.
    expect(screen.getByTestId('view-content')).toHaveTextContent('Harmonogram projektu');
  });

  // @scenario: quick-notes.feature > Zavření Quick Notes panelu
  it('klik na "×" panel zavře a stránka zůstane ve stejném stavu jako předtím', async () => {
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([]);
    vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([]);
    render(
      <div>
        <div data-testid="view-content">Harmonogram projektu</div>
        <Harness />
      </div>
    );
    const icon = screen.getByRole('button', { name: /📝 Poznámky/ });
    await userEvent.click(icon);
    await screen.findByRole('dialog', { name: 'Quick Notes' });

    await userEvent.click(screen.getByRole('button', { name: 'Zavřít poznámky' }));
    expect(screen.queryByRole('dialog', { name: 'Quick Notes' })).not.toBeInTheDocument();

    // Alternativně panel zavírá i opětovný klik na ikonu (ne jen "×").
    await userEvent.click(icon);
    await screen.findByRole('dialog', { name: 'Quick Notes' });
    await userEvent.click(icon);

    expect(screen.queryByRole('dialog', { name: 'Quick Notes' })).not.toBeInTheDocument();
    expect(screen.getByTestId('view-content')).toHaveTextContent('Harmonogram projektu');
  });

  // @scenario: quick-notes.feature > Quick Notes panel je dostupný na všech záložkách
  it('panel se otevře i po přepnutí na jinou záložku (Úkoly)', async () => {
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([]);
    vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([]);
    render(<ViewSwitchHarness />);

    await userEvent.click(screen.getByText('Přepnout na Úkoly'));
    expect(screen.getByTestId('active-view')).toHaveTextContent('ukoly');
    await userEvent.click(screen.getByRole('button', { name: /📝 Poznámky/ }));

    expect(await screen.findByText('Moje poznámky')).toBeInTheDocument();
  });

  // @scenario: quick-notes.feature > Quick Notes panel je dostupný i na LandingPage
  it('panel je dostupný bez otevřeného projektu a zobrazí poznámky bez linku na projekt', async () => {
    vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([
      note({ content: 'Nezávislá poznámka' }),
    ]);
    vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([projectSummary()]);
    render(<Harness activeProjectId={null} />);

    await userEvent.click(screen.getByRole('button', { name: /📝 Poznámky/ }));

    expect(await screen.findByText('Nezávislá poznámka')).toBeInTheDocument();
    // "Backend refaktoring" existuje jen jako volba filtru, ne jako tag u poznámky.
    expect(screen.getAllByText('Backend refaktoring')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Backend refaktoring' })).toBeInTheDocument();
  });
});
