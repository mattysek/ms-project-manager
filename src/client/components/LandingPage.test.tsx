// Testy LandingPage — REST API místo projectStorage (ADR-005, project-management.feature).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSummary } from '../api/projectsApi';
import * as projectsApi from '../api/projectsApi';
import { LandingPage } from './LandingPage';
import { takePendingImport } from '../state/pendingImport';

function summary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 'p1',
    name: 'Backend refaktoring',
    startDate: '2026-01-05',
    endDate: '2026-06-26',
    budget: 100,
    peopleCount: 2,
    taskCount: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setBrowserOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true, writable: true });
}

/**
 * `importAsNewProject` (LandingPage.tsx) vytváří `<input type=file>` mimo DOM
 * a rovnou ho "klikne" — nejde přes prvek dohledatelný přes `screen`, protože
 * nativní file picker jsdom neumí ovládat. Nahradíme `.click()` přímým
 * vyvoláním `onchange` s naším souborem.
 */
function stubFilePicker(file: File): void {
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    const el = original(tagName);
    if (tagName === 'input') {
      const input = el as HTMLInputElement;
      vi.spyOn(input, 'click').mockImplementation(() => {
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        // `dispatchEvent` (ne přímé volání `onchange`) — handler čte `e.target`,
        // které je vyplněné jen při skutečném průchodu DOM eventem.
        input.dispatchEvent(new Event('change'));
      });
    }
    return el;
  }) as typeof document.createElement);
}

function jsonImportFile(name: string, data: Record<string, unknown>): File {
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  // jsdom 25.x zatím neimplementuje `Blob.prototype.text()`, které `parseImportFile`
  // používá pro JSON větev — v reálném prohlížeči je to plně podporované, jde
  // tedy o mezeru testovacího prostředí, ne produkčního kódu.
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      value: async () => JSON.stringify(data),
      configurable: true,
    });
  }
  return file;
}

/** ZIP s `project.json` + jednou přílohou ve `files/` — stejný tvar, jaký produkuje `exportProject` (useExportImport.ts). */
async function zipImportFile(name: string): Promise<File> {
  const zip = new JSZip();
  zip.file(
    'project.json',
    JSON.stringify({
      _version: 1,
      project: { name: 'Projekt s přílohy' },
      files: [
        {
          id: 'f1',
          name: 'a.pdf',
          mimeType: 'application/pdf',
          size: 3,
          addedAt: '2026-01-01T00:00:00.000Z',
          note: '',
        },
      ],
    })
  );
  zip.folder('files')?.file('f1_a.pdf', 'abc');
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], name, { type: 'application/zip' });
}

afterEach(() => {
  vi.restoreAllMocks();
  setBrowserOnline(true);
  sessionStorage.clear();
});

describe('LandingPage — vytvoření a otevření projektu', () => {
  // @scenario: project-management.feature > Vytvoření nového projektu
  it('vyplnění formuláře a "Vytvořit" otevře nově vytvořený projekt', async () => {
    vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([]);
    vi.spyOn(projectsApi, 'createProject').mockResolvedValue(
      summary({ id: 'new-proj', name: 'Mobilní aplikace v2' })
    );
    const onOpenProject = vi.fn();
    render(<LandingPage onOpenProject={onOpenProject} onOpenMyWork={vi.fn()} />);

    await userEvent.click(await screen.findByText('+ Nový projekt'));
    await userEvent.type(screen.getByPlaceholderText('Název projektu...'), 'Mobilní aplikace v2');
    await userEvent.click(screen.getByText('Vytvořit'));

    await waitFor(() => expect(onOpenProject).toHaveBeenCalledWith('new-proj'));
    expect(projectsApi.createProject).toHaveBeenCalledWith('Mobilní aplikace v2');
  });

  // @scenario: project-management.feature > Otevření existujícího projektu
  it('klik na projekt v seznamu ho otevře', async () => {
    vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([
      summary({ id: 'existing', name: 'Backend refaktoring' }),
    ]);
    const onOpenProject = vi.fn();
    render(<LandingPage onOpenProject={onOpenProject} onOpenMyWork={vi.fn()} />);

    await userEvent.click(await screen.findByText('Backend refaktoring'));

    expect(onOpenProject).toHaveBeenCalledWith('existing');
  });
});

describe('LandingPage — import projektu', () => {
  // @scenario: offline.feature > Import projektu je zakázán při offline
  it('offline: klik na Import zobrazí chybu a nic nevytvoří', async () => {
    setBrowserOnline(false);
    vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([]);
    const createSpy = vi.spyOn(projectsApi, 'createProject');
    render(<LandingPage onOpenProject={vi.fn()} onOpenMyWork={vi.fn()} />);

    await userEvent.click(await screen.findByText('⬆ Import...'));

    // Pruh, ne `alert()`: modální dialog prohlížeče nejde zavřít klávesnicí
    // a v aplikaci, která jinde hlásí chyby přes `role="alert"`, je cizí prvek.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Import projektu vyžaduje připojení k serveru'
    );
    expect(createSpy).not.toHaveBeenCalled();
  });

  // @scenario: project-management.feature > Import projektu z JSON souboru
  it('vybere JSON soubor, vytvoří nový projekt a otevře ho s daty ze souboru', async () => {
    vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([]);
    vi.spyOn(projectsApi, 'createProject').mockResolvedValue(
      summary({ id: 'imported-json', name: 'Ze zálohy' })
    );
    const onOpenProject = vi.fn();
    stubFilePicker(
      jsonImportFile('zaloha-projektu.json', {
        _version: 1,
        project: { name: 'Ze zálohy' },
        tasks: [],
        people: [],
      })
    );
    render(<LandingPage onOpenProject={onOpenProject} onOpenMyWork={vi.fn()} />);

    await userEvent.click(await screen.findByText('⬆ Import...'));

    // Projekt je založený stejnou cestou jako "Vytvoření nového projektu"
    // (`POST /projects` — odesílatel se stává PM server-side), jen s názvem
    // odvozeným z importovaného souboru — proto je "uložen na serveru" a
    // "jan.novak je PM" pokryté stejnou serverovou zárukou.
    await waitFor(() => expect(projectsApi.createProject).toHaveBeenCalledWith('Ze zálohy'));
    await waitFor(() => expect(onOpenProject).toHaveBeenCalledWith('imported-json'));

    const pending = takePendingImport('imported-json') ?? ({} as never);
    expect(pending.project.name).toBe('Ze zálohy');
  });

  // @scenario: project-management.feature > Import projektu z ZIP souboru
  it('vybere ZIP soubor a naimportuje data projektu i soubory z přílohy', async () => {
    vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([]);
    vi.spyOn(projectsApi, 'createProject').mockResolvedValue(
      summary({ id: 'imported-zip', name: 'Projekt s přílohy' })
    );
    const onOpenProject = vi.fn();
    stubFilePicker(await zipImportFile('projekt-s-prilohy.zip'));
    render(<LandingPage onOpenProject={onOpenProject} onOpenMyWork={vi.fn()} />);

    await userEvent.click(await screen.findByText('⬆ Import...'));

    await waitFor(() => expect(onOpenProject).toHaveBeenCalledWith('imported-zip'));

    // Soubory z `files/` ve ZIPu čekají v odloženém importu spolu s daty
    // projektu — `App.tsx`/`ProjectWorkspace` je po `full_state_import` uloží
    // do sekce Soubory (mimo dosah LandingPage, proto tady jen ověřujeme, že
    // se skutečně naparsovaly a předaly dál).
    // Obsah příloh se do `sessionStorage` schválně neukládá (kvóta), takže se
    // odložený import vyzvedává přes `takePendingImport`.
    const pending = takePendingImport('imported-zip');
    expect(pending?.files).toHaveLength(1);
    expect(pending?.files[0].name).toBe('a.pdf');
  });

  // @scenario: project-management.feature > Chyba importu se zobrazí jako pruh, ne jako dialog prohlížeče
  // @scenario: project-management.feature > Import souboru s neplatným formátem
  it('vybere nepodporovaný formát souboru a zobrazí chybovou zprávu', async () => {
    vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([]);
    const createSpy = vi.spyOn(projectsApi, 'createProject');
    stubFilePicker(
      new File(['obsah'], 'dokument.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    );
    render(<LandingPage onOpenProject={vi.fn()} onOpenMyWork={vi.fn()} />);

    await userEvent.click(await screen.findByText('⬆ Import...'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Import selhal: Nepodporovaný formát souboru. Použijte JSON nebo ZIP.'
      )
    );
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('LandingPage — obnovení seznamu', () => {
  // @scenario: project-management.feature > Seznam projektů se obnoví po návratu do okna
  it('návrat do okna přenačte seznam projektů', async () => {
    // Přidání do projektu nemá vlastní diff (na rozdíl od změny role), takže
    // uživatel koukající na seznam by o novém projektu nevěděl, dokud stránku
    // sám neobnoví. Návrat do okna je nejbližší okamžik, kdy o něm mohl
    // slyšet jinde.
    const listSpy = vi
      .spyOn(projectsApi, 'listProjects')
      .mockResolvedValueOnce([])
      .mockResolvedValue([summary({ id: 'novy', name: 'Backend refaktoring' })]);

    render(<LandingPage onOpenProject={vi.fn()} onOpenMyWork={vi.fn()} />);
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Backend refaktoring')).not.toBeInTheDocument();

    fireEvent(window, new Event('focus'));

    expect(await screen.findByText('Backend refaktoring')).toBeInTheDocument();
  });
});

describe('LandingPage — archiv projektu', () => {
  // @scenario: project-management.feature > Archivace projektu (PM only)
  it('potvrzení archivace zavolá archiveProject a projekt zmizí z aktivních', async () => {
    vi.spyOn(projectsApi, 'listProjects')
      .mockResolvedValueOnce([summary({ id: 'to-archive', name: 'Starý projekt' })])
      .mockResolvedValueOnce([
        {
          ...summary({ id: 'to-archive', name: 'Starý projekt' }),
          archivedAt: '2026-08-17T10:00:00Z',
        },
      ]);
    vi.spyOn(projectsApi, 'archiveProject').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LandingPage onOpenProject={vi.fn()} onOpenMyWork={vi.fn()} />);
    await screen.findByText('Starý projekt');

    await userEvent.click(screen.getByLabelText('Archivovat — Starý projekt'));

    await waitFor(() => expect(projectsApi.archiveProject).toHaveBeenCalledWith('to-archive'));
    // Projekt zmizel z aktivních; v archivu je až po rozbalení sekce.
    await waitFor(() => expect(screen.getByText(/Archiv \(1\)/)).toBeInTheDocument());
    expect(screen.queryByLabelText('Archivovat — Starý projekt')).not.toBeInTheDocument();
  });

  // @scenario: project-management.feature > Vrácení projektu z archivu
  it('archivovaný projekt jde vrátit zpět mezi aktivní', async () => {
    const archived = {
      ...summary({ id: 'arch', name: 'Starý projekt' }),
      archivedAt: '2026-08-17T10:00:00Z',
    };
    vi.spyOn(projectsApi, 'listProjects')
      .mockResolvedValueOnce([archived])
      .mockResolvedValueOnce([summary({ id: 'arch', name: 'Starý projekt' })]);
    vi.spyOn(projectsApi, 'unarchiveProject').mockResolvedValue(undefined);
    render(<LandingPage onOpenProject={vi.fn()} onOpenMyWork={vi.fn()} />);

    await userEvent.click(await screen.findByText(/Archiv \(1\)/));
    await userEvent.click(screen.getByLabelText('Vrátit z archivu — Starý projekt'));

    await waitFor(() => expect(projectsApi.unarchiveProject).toHaveBeenCalledWith('arch'));
    await waitFor(() =>
      expect(screen.getByLabelText('Archivovat — Starý projekt')).toBeInTheDocument()
    );
  });

  // @scenario: project-management.feature > Smazat lze jen archivovaný projekt
  it('u aktivního projektu se nenabízí trvalé smazání', async () => {
    vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([
      summary({ id: 'live', name: 'Běžící projekt' }),
    ]);
    render(<LandingPage onOpenProject={vi.fn()} onOpenMyWork={vi.fn()} />);
    await screen.findByText('Běžící projekt');

    // Jediná akce u aktivního projektu je archivace. Hlášku
    // „Smazat lze jen archivovaný projekt" vynucuje server (`ProjectsApi.fs`).
    expect(screen.getByLabelText('Archivovat — Běžící projekt')).toBeInTheDocument();
    expect(screen.queryByLabelText('Smazat trvale — Běžící projekt')).not.toBeInTheDocument();
  });

  // @scenario: project-management.feature > Trvalé smazání archivovaného projektu (PM only)
  it('potvrzení v dialogu zavolá DELETE a projekt zmizí i z archivu', async () => {
    const archived = {
      ...summary({ id: 'to-delete', name: 'Starý projekt' }),
      archivedAt: '2026-08-17T10:00:00Z',
    };
    vi.spyOn(projectsApi, 'listProjects')
      .mockResolvedValueOnce([archived])
      .mockResolvedValueOnce([]);
    vi.spyOn(projectsApi, 'deleteProject').mockResolvedValue(undefined);
    render(<LandingPage onOpenProject={vi.fn()} onOpenMyWork={vi.fn()} />);

    await userEvent.click(await screen.findByText(/Archiv \(1\)/));
    await userEvent.click(screen.getByLabelText('Smazat trvale — Starý projekt'));
    await userEvent.click(screen.getByText('Smazat'));

    // „Všechna data projektu jsou trvale smazána" je serverová odpovědnost
    // (cascade delete v `ProjectsApi.fs`) — z frontendu ověříme, že DELETE
    // skutečně odešel a že projekt zmizel i z archivu.
    await waitFor(() => expect(projectsApi.deleteProject).toHaveBeenCalledWith('to-delete'));
    await waitFor(() => expect(screen.queryByText(/Archiv/)).not.toBeInTheDocument());
  });
});
