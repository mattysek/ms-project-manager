// Testy SeznamView + (v ní vnořeného) TaskDetailModal — scénáře
// `docs/features/tasks.feature`.
//
// Render přes `renderSeznam` harness (`seznamViewHarness.tsx`) — view napojený
// na reálné command hooky s fake serverem (stejný vzor jako AdoSyncView.test.tsx:
// `dispatched` je odchozí strana / co by šlo na server, viditelný stav view je
// odvozený z optimistické aplikace nad fake kanálem).
//
// Poznámka k „klikne Uložit": SeznamView edituje řádky inline (commandy jdou
// hned při každé změně pole, žádné samostatné tlačítko Uložit na řádku
// neexistuje). TaskDetailModal naopak drží lokální draft a commituje ho
// najednou tlačítkem „Uložit změny" — tam scénáře na to tlačítko mapujeme.

import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../state/testFixtures';
import type { Person, Task } from '../../types';
import { JAN, PETRA, renderSeznam } from './seznamViewHarness';

// `vi.mock` je hoistovaný nad importy — proměnná musí jít přes `vi.hoisted`.
const { writeFileMock } = vi.hoisted(() => ({ writeFileMock: vi.fn() }));
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: writeFileMock };
});

import * as XLSX from 'xlsx';

// ── Pomocné dotazy nad tabulkou úkolů ───────────────────────────────────────

/** Řádek úkolu — dohledaný podle aktuální hodnoty pole „Úkol". */
function taskRow(name: string): HTMLElement {
  return screen.getByDisplayValue(name).closest('tr') as HTMLElement;
}

/** Číselné vstupy řádku v pořadí W od / W do / MD (progress je slider, ne spinbutton). */
function weekAndMdInputs(row: HTMLElement) {
  const [s, e, md] = within(row).getAllByRole('spinbutton');
  return { s, e, md };
}

function openDetail(row: HTMLElement): void {
  fireEvent.click(within(row).getByRole('button', { name: /Detail/ }));
}

/** Vylezme o `levels` úrovní výš od elementu — bez non-null assertion, s jasnou chybou. */
function ancestor(el: Element | undefined, levels: number): HTMLElement {
  let current: Element | null | undefined = el;
  for (let i = 0; i < levels && current; i++) current = current.parentElement;
  if (!current) throw new Error('Předek nenalezen — zkontroluj strukturu DOM v SeznamView.');
  return current as HTMLElement;
}

/** Sekce osoby (nadpis se jménem + tabulka) — jméno se jinak opakuje i v selectech. */
function personSection(name: string): HTMLElement {
  const heading = screen.getAllByText(name).find((el) => el.tagName === 'SPAN');
  return ancestor(heading, 2);
}

function backlogSection(): HTMLElement {
  return ancestor(screen.getByText('Backlog'), 2);
}

function linksSection(): HTMLElement {
  return ancestor(screen.getByText('Externí odkazy'), 2);
}

function makeDataTransfer() {
  const store = new Map<string, string>();
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: (key: string, value: string) => store.set(key, value),
    getData: (key: string) => store.get(key) ?? '',
  };
}

function tasksFor(person: Person, count: number): Task[] {
  return Array.from({ length: count }, (_, i) =>
    makeTask({ id: `${person.id}-${i}`, name: `Úkol ${person.name} ${i + 1}`, p: person.id })
  );
}

// ── Přidání úkolu ────────────────────────────────────────────────────────────

describe('SeznamView — přidání úkolu', () => {
  // @scenario: tasks.feature > Přidání nového úkolu
  it('vytvoří úkol s parametry zadanými v řádku a pošle je jako commandy', () => {
    const { commandsOf } = renderSeznam();

    fireEvent.click(
      within(personSection(PETRA.name)).getByRole('button', { name: '+ Přidat úkol' })
    );
    fireEvent.change(within(taskRow('Nový úkol')).getByRole('textbox'), {
      target: { value: 'Implementace REST API' },
    });

    const row = taskRow('Implementace REST API');
    fireEvent.change(within(row).getByRole('combobox'), { target: { value: 'backend' } });
    const { s, e, md } = weekAndMdInputs(row);
    fireEvent.change(s, { target: { value: '1' } });
    fireEvent.change(e, { target: { value: '3' } });
    fireEvent.change(md, { target: { value: '12' } });

    const finalRow = taskRow('Implementace REST API');
    expect(within(finalRow).getByRole('combobox')).toHaveValue('backend');
    const finalInputs = weekAndMdInputs(finalRow);
    expect(finalInputs.s).toHaveValue(1);
    expect(finalInputs.e).toHaveValue(3);
    expect(finalInputs.md).toHaveValue(12);
    expect(
      within(personSection(PETRA.name)).getByDisplayValue('Implementace REST API')
    ).toBeInTheDocument();

    const addTaskCommands = commandsOf('add_task');
    const moveTaskCommands = commandsOf('move_task');
    expect(addTaskCommands[addTaskCommands.length - 1]?.task.p).toBe(PETRA.id);
    expect(moveTaskCommands[moveTaskCommands.length - 1]).toMatchObject({ s: 1, e: 3 });
    expect(commandsOf('update_task').some((c) => c.fields.md === 12)).toBe(true);
  });

  // @scenario: tasks.feature > Přidání úkolu do backlogu (bez přiřazení)
  it('založí úkol bez osoby přímo v sekci Backlog', () => {
    const { lastCommand } = renderSeznam();

    fireEvent.click(screen.getByRole('button', { name: '+ Přidat do backlogu' }));
    fireEvent.change(within(taskRow('Nový backlog úkol')).getByRole('textbox'), {
      target: { value: 'Budoucí feature X' },
    });

    expect(within(backlogSection()).getByDisplayValue('Budoucí feature X')).toBeInTheDocument();
    expect(lastCommand('add_task')?.task.p).toBe('');
  });
});

// ── Editace úkolu ────────────────────────────────────────────────────────────

describe('SeznamView — inline editace', () => {
  // @scenario: tasks.feature > Editace názvu úkolu inline
  it('po stisku Enter je nový název vidět v seznamu a uložen commandem', () => {
    const existing = makeTask({ id: 't1', name: 'Implementace REST API', p: PETRA.id });
    const { lastCommand } = renderSeznam({ tasks: [existing] });

    const input = screen.getByDisplayValue('Implementace REST API');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'Implementace REST API — fáze 1' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByDisplayValue('Implementace REST API — fáze 1')).toBeInTheDocument();
    expect(lastCommand('update_task')).toEqual({
      type: 'update_task',
      taskId: 't1',
      fields: { name: 'Implementace REST API — fáze 1' },
    });
  });
});

describe('TaskDetailModal — detail a základní pole', () => {
  // @scenario: tasks.feature > Otevření detailu úkolu a editace
  it('zobrazí data úkolu a po uložení commitne MD i progress jedním commandem', () => {
    const existing = makeTask({
      id: 't1',
      name: 'Implementace REST API',
      p: PETRA.id,
      cat: 'backend',
      s: 1,
      e: 3,
      md: 12,
      progress: 0,
    });
    const { lastCommand } = renderSeznam({ tasks: [existing] });

    openDetail(taskRow('Implementace REST API'));
    expect(screen.getByText('Detail úkolu')).toBeInTheDocument();
    expect(screen.getByLabelText('Název úkolu')).toHaveValue('Implementace REST API');
    expect(screen.getByLabelText('Přiřazeno')).toHaveValue(PETRA.id);
    expect(screen.getByLabelText('Kategorie')).toHaveValue('backend');
    expect(screen.getByLabelText('Týden od')).toHaveValue(1);
    expect(screen.getByLabelText('Týden do')).toHaveValue(3);
    expect(screen.getByLabelText('MD')).toHaveValue(12);
    expect(screen.getByText('Progress: 0%')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('MD'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Progress'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));

    expect(screen.queryByText('Detail úkolu')).not.toBeInTheDocument();
    const row = taskRow('Implementace REST API');
    expect(weekAndMdInputs(row).md).toHaveValue(15);
    expect(within(row).getByText('20%')).toBeInTheDocument();
    expect(lastCommand('update_task')).toEqual({
      type: 'update_task',
      taskId: 't1',
      fields: { md: 15, progress: 20 },
    });
  });
});

// ── Popis a odkazy ───────────────────────────────────────────────────────────

describe('TaskDetailModal — popis (markdown)', () => {
  // @scenario: tasks.feature > Přidání popisu (markdown) k úkolu
  it('vykreslí markdown v náhledu; přepínač nic neukládá', () => {
    const existing = makeTask({ id: 't1', name: 'Implementace REST API', p: PETRA.id });
    renderSeznam({ tasks: [existing] });
    openDetail(taskRow('Implementace REST API'));

    expect(screen.getByText('Popis (Markdown)')).toBeInTheDocument();

    // Popis je obyčejné pole konceptu — píše se rovnou, žádné „✎ Upravit".
    const markdown =
      '## Popis\n\nImplementovat CRUD operace pro entity User, Project, Task.\n\n' +
      '- GET /api/users\n- POST /api/users';
    fireEvent.change(screen.getByLabelText('Popis úkolu'), { target: { value: markdown } });

    fireEvent.click(screen.getByRole('button', { name: '👁 Náhled' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Popis' })).toBeInTheDocument();
    expect(screen.getByText('GET /api/users')).toBeInTheDocument();
    expect(screen.getByText('POST /api/users')).toBeInTheDocument();
  });

  // @scenario: tasks.feature > Popis se ukládá společně se zbytkem úkolu
  it('popis odejde až s „Uložit změny", stejně jako ostatní pole', () => {
    // Dřív měl popis vlastní „Uložit popis" a kdo ho nezmáčkl, o text přišel.
    const existing = makeTask({ id: 't1', name: 'Implementace REST API', p: PETRA.id });
    const { lastCommand } = renderSeznam({ tasks: [existing] });
    openDetail(taskRow('Implementace REST API'));

    fireEvent.change(screen.getByLabelText('Popis úkolu'), {
      target: { value: 'Akceptační kritéria' },
    });
    fireEvent.change(document.getElementById('task-detail-md') as HTMLInputElement, {
      target: { value: '9' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Uložit změny/ }));

    expect(lastCommand('update_task')?.fields).toMatchObject({
      desc: 'Akceptační kritéria',
      md: 9,
    });
  });
});

describe('TaskDetailModal — externí odkazy', () => {
  // @scenario: tasks.feature > Přidání externího odkazu k úkolu
  it('přidá odkaz, zobrazí ho v seznamu s otevíráním v novém tabu a uloží úkol', () => {
    const existing = makeTask({ id: 't1', name: 'Implementace REST API', p: PETRA.id });
    const { lastCommand } = renderSeznam({ tasks: [existing] });
    openDetail(taskRow('Implementace REST API'));

    fireEvent.click(within(linksSection()).getByRole('button', { name: /Přidat odkaz/ }));
    const [label, url] = within(linksSection()).getAllByRole('textbox');
    fireEvent.change(label, { target: { value: 'Confluence specifikace' } });
    fireEvent.change(url, { target: { value: 'https://confluence.firma.cz/display/BE/REST-API' } });

    expect(within(linksSection()).getByDisplayValue('Confluence specifikace')).toBeInTheDocument();
    const openLink = within(linksSection()).getByRole('link');
    expect(openLink).toHaveAttribute('href', 'https://confluence.firma.cz/display/BE/REST-API');
    expect(openLink).toHaveAttribute('target', '_blank');

    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));

    expect(lastCommand('update_task')).toMatchObject({
      type: 'update_task',
      taskId: 't1',
      fields: {
        links: [
          {
            label: 'Confluence specifikace',
            url: 'https://confluence.firma.cz/display/BE/REST-API',
          },
        ],
      },
    });
  });

  // @scenario: tasks.feature > Smazání odkazu
  it('smaže odkaz ze seznamu odkazů', () => {
    const link = {
      id: 'l1',
      label: 'Confluence specifikace',
      url: 'https://confluence.firma.cz/x',
    };
    const existing = makeTask({
      id: 't1',
      name: 'Implementace REST API',
      p: PETRA.id,
      links: [link],
    });
    renderSeznam({ tasks: [existing] });
    openDetail(taskRow('Implementace REST API'));

    expect(within(linksSection()).getByDisplayValue('Confluence specifikace')).toBeInTheDocument();
    fireEvent.click(within(linksSection()).getByRole('button', { name: '✕' }));

    expect(
      within(linksSection()).queryByDisplayValue('Confluence specifikace')
    ).not.toBeInTheDocument();
  });
});

// ── Progress slider ──────────────────────────────────────────────────────────

describe('TaskDetailModal — progress slider', () => {
  // @scenario: tasks.feature > Nastavení progress slideru
  it('zobrazí přesunutou hodnotu a uloží ji jako update_progress', () => {
    const existing = makeTask({
      id: 't1',
      name: 'Implementace REST API',
      p: PETRA.id,
      progress: 0,
    });
    const { lastCommand } = renderSeznam({ tasks: [existing] });
    openDetail(taskRow('Implementace REST API'));

    fireEvent.change(screen.getByLabelText('Progress'), { target: { value: '75' } });
    expect(screen.getByText('Progress: 75%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));

    expect(lastCommand('update_progress')).toEqual({
      type: 'update_progress',
      taskId: 't1',
      progress: 75,
    });
  });
});

// ── Přeřazení na jinou osobu ─────────────────────────────────────────────────

describe('Přeřazení úkolu na jinou osobu', () => {
  // @scenario: tasks.feature > Přeřazení úkolu na jinou osobu (PM)
  it('přes detail modal změní osobu a pošle update_task s novým p', () => {
    const existing = makeTask({ id: 't1', name: 'Implementace REST API', p: PETRA.id });
    const { lastCommand } = renderSeznam({ tasks: [existing] });
    openDetail(taskRow('Implementace REST API'));

    fireEvent.change(screen.getByLabelText('Přiřazeno'), { target: { value: JAN.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));

    expect(lastCommand('update_task')).toEqual({
      type: 'update_task',
      taskId: 't1',
      fields: { p: JAN.id },
    });
    expect(
      within(personSection(JAN.name)).getByDisplayValue('Implementace REST API')
    ).toBeInTheDocument();
    // Barva úkolu v Gantt view podle osoby je mimo SeznamView/TaskDetailModal —
    // pokrývá ji gantt.feature, ne tenhle soubor.
  });

  // @scenario: tasks.feature > Drag-and-drop přeřazení úkolu na jinou osobu (SeznamView)
  it('přetažením řádku na jinou osobu ho přeřadí a uloží změnu commandem', () => {
    const existing = makeTask({ id: 't1', name: 'Implementace REST API', p: PETRA.id });
    const { lastCommand } = renderSeznam({ tasks: [existing] });

    const handle = within(taskRow('Implementace REST API')).getByTitle(
      'Přetáhněte pro změnu přiřazení'
    );
    const target = personSection(JAN.name);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(
      within(personSection(JAN.name)).getByDisplayValue('Implementace REST API')
    ).toBeInTheDocument();
    expect(lastCommand('update_task')).toEqual({
      type: 'update_task',
      taskId: 't1',
      fields: { p: JAN.id },
    });
  });
});

// ── Smazání úkolu ────────────────────────────────────────────────────────────

describe('Smazání úkolu', () => {
  // @scenario: tasks.feature > Smazání úkolu (PM)
  it('po potvrzení dialogu smaže úkol, zavře modal a odešle delete_task', () => {
    const existing = makeTask({ id: 't1', name: 'Stará feature', p: PETRA.id });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { commandsOf } = renderSeznam({ tasks: [existing] });
    openDetail(taskRow('Stará feature'));

    fireEvent.click(screen.getByRole('button', { name: 'Smazat úkol' }));

    expect(confirmSpy).toHaveBeenCalledWith('Opravdu smazat úkol Stará feature?');
    expect(screen.queryByText('Detail úkolu')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Stará feature')).not.toBeInTheDocument();
    expect(commandsOf('delete_task')).toEqual([{ type: 'delete_task', taskId: 't1' }]);
  });
});

// ── Filtry ───────────────────────────────────────────────────────────────────

describe('Filtrování', () => {
  // @scenario: tasks.feature > Filtrování úkolů dle osoby
  it('filtr osoby zobrazí jen její úkoly a skryje backlog', () => {
    const janTasks = tasksFor(JAN, 3);
    const petraTasks = tasksFor(PETRA, 5);
    const backlogTask = makeTask({ id: 'b1', name: 'Backlog úkol', p: '' });
    renderSeznam({ tasks: [...janTasks, ...petraTasks, backlogTask] });

    fireEvent.change(screen.getByLabelText('Filtr osoby'), { target: { value: PETRA.id } });

    for (const t of petraTasks) expect(screen.getByDisplayValue(t.name)).toBeInTheDocument();
    for (const t of janTasks) expect(screen.queryByDisplayValue(t.name)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Backlog úkol')).not.toBeInTheDocument();
  });

  // @scenario: tasks.feature > Filtrování úkolů dle kategorie
  it('filtr kategorie zobrazí jen úkoly té kategorie', () => {
    const backend = Array.from({ length: 4 }, (_, i) =>
      makeTask({ id: `be-${i}`, name: `Backend úkol ${i + 1}`, p: JAN.id, cat: 'backend' })
    );
    const obecne = Array.from({ length: 2 }, (_, i) =>
      makeTask({ id: `ob-${i}`, name: `Obecný úkol ${i + 1}`, p: JAN.id, cat: 'obecne' })
    );
    renderSeznam({ tasks: [...backend, ...obecne] });

    fireEvent.click(screen.getByRole('button', { name: 'backend' }));

    for (const t of backend) expect(screen.getByDisplayValue(t.name)).toBeInTheDocument();
    for (const t of obecne) expect(screen.queryByDisplayValue(t.name)).not.toBeInTheDocument();
  });
});

// ── Kategorie ────────────────────────────────────────────────────────────────

describe('Správa kategorií', () => {
  // @scenario: tasks.feature > Přidání nové kategorie
  it('přidá kategorii a zpřístupní ji v dropdownu kategorií u úkolů', () => {
    const existing = makeTask({ id: 't1', name: 'Existující úkol', p: JAN.id });
    const { lastCommand } = renderSeznam({ tasks: [existing] });

    fireEvent.click(screen.getByText('Správa kategorií'));
    fireEvent.change(screen.getByPlaceholderText('Název kategorie…'), {
      target: { value: 'frontend' },
    });
    fireEvent.change(document.getElementById('cp_new') as HTMLInputElement, {
      target: { value: '#a78bfa' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Přidat' }));

    const command = lastCommand('set_cats');
    const added = Object.values(command?.cats ?? {}).find((c) => c.label === 'frontend');
    expect(added?.bd).toBe('#a78bfa');

    const catSelect = within(taskRow('Existující úkol')).getByRole('combobox');
    expect(within(catSelect).getByText('frontend')).toBeInTheDocument();
  });
});

// ── Export ───────────────────────────────────────────────────────────────────

describe('Export do Excelu', () => {
  // @scenario: tasks.feature > Export úkolů do Excelu
  it('stáhne sešit s listem Úkoly a očekávanými sloupci', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: `t${i}`, name: `Úkol ${i + 1}`, p: JAN.id })
    );
    renderSeznam({ tasks });

    fireEvent.click(screen.getByRole('button', { name: /Export Excel/ }));

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [workbook] = writeFileMock.mock.calls[0];
    expect(workbook.SheetNames).toContain('Úkoly');
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets.Úkoly);
    for (const col of [
      'Název',
      'Osoba',
      'Kategorie',
      'Začátek (týden)',
      'Konec (týden)',
      'MD',
      'Progress',
    ]) {
      expect(csv).toContain(col);
    }
  });
});

// ── Undo ─────────────────────────────────────────────────────────────────────

describe('Undo', () => {
  // @scenario: tasks.feature > Undo po přidání úkolu
  it('Ctrl+Z odstraní přidaný úkol a pošle serveru inverzní delete_task', () => {
    const { commandsOf, lastCommand, undo } = renderSeznam();

    fireEvent.click(
      within(personSection(PETRA.name)).getByRole('button', { name: '+ Přidat úkol' })
    );
    const addedId = lastCommand('add_task')?.task.id;
    expect(screen.getByDisplayValue('Nový úkol')).toBeInTheDocument();

    act(() => undo());

    expect(screen.queryByDisplayValue('Nový úkol')).not.toBeInTheDocument();
    expect(commandsOf('delete_task')).toEqual([{ type: 'delete_task', taskId: addedId }]);
  });
});
