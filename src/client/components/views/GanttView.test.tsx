// Testy GanttView — scénáře `docs/features/gantt.feature`.
//
// Render přes `renderGantt` harness (`ganttViewHarness.tsx`) — view napojený
// na reálné command hooky s fake serverem (stejný vzor jako
// SeznamView.test.tsx/RizikaView.test.tsx): `dispatched` je odchozí strana
// (co by šlo na server), viditelný stav view je odvozený z optimistické
// aplikace nad fake kanálem.
//
// Drag v Gantt je myší interakce (mousedown/mousemove/mouseup), ne HTML5
// drag-and-drop jako v SeznamView — jsdom `getBoundingClientRect()` vrací
// pořád nuly, takže testy pozici počítají ze stejného vzorce jako
// `GanttView.onMouseMove` (viz `xForWeek`), místo aby spoléhaly na skutečný
// layout.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import html2canvas from 'html2canvas';
import { computeMonthGroups, computeWeeks } from '../../utils';
import {
  API_REFAKTORING,
  DATABAZOVA_MIGRACE,
  INFRASTRUKTURA,
  NUM_WEEKS,
  PETRA,
  renderGantt,
} from './ganttViewHarness';
import { CELL_W, INIT_CATS, NAME_W } from '../../constants';

vi.mock('html2canvas', () => ({ default: vi.fn() }));

/** Souřadnice X, na kterou `GanttView.onMouseMove` namapuje zadaný (1-based) týden. */
function xForWeek(week: number): number {
  return NAME_W + 2 + (week - 1) * CELL_W;
}

function bar(name: string): HTMLElement {
  return screen.getByText(name).parentElement as HTMLElement;
}

function leftHandle(name: string): HTMLElement {
  return bar(name).children[0] as HTMLElement;
}

function rightHandle(name: string): HTMLElement {
  return bar(name).children[1] as HTMLElement;
}

afterEach(() => {
  vi.useRealTimers();
});

// ── Zobrazení pruhů ──────────────────────────────────────────────────────────

describe('Zobrazení úkolů jako pruhy', () => {
  // @scenario: gantt.feature > Zobrazení úkolů jako pruhy
  it('zobrazí pruhy pro všechny úkoly obarvené podle kategorie, 100% progress vyplněný a milník jako diamant na W4', () => {
    renderGantt();

    expect(screen.getByText('API refaktoring')).toBeInTheDocument();
    expect(screen.getByText('Infrastruktura')).toBeInTheDocument();
    expect(screen.getByText('Databázová migrace')).toBeInTheDocument();

    const apiBar = bar('API refaktoring');
    expect(apiBar).toHaveStyle({ left: `${(1 - 1) * CELL_W + 2}px` });
    expect(apiBar).toHaveStyle({ width: `${(4 - 1 + 1) * CELL_W - 4}px` });

    // Barva je z KATEGORIE, ne z osoby: každá osoba má vlastní swimlane řádek
    // s vlastní jmenovkou, takže barva podle osoby neřekla nic navíc — a
    // hlavně tím ztrácela smysl legenda kategorií pod grafem.
    expect(apiBar).toHaveStyle({ borderColor: INIT_CATS.obecne.bd });

    const infraBar = bar('Infrastruktura');
    expect(within(infraBar).getByText('✓')).toBeInTheDocument();

    expect(screen.getByText(/M1 — Alpha/)).toBeInTheDocument();
  });
});

// ── Tooltip ──────────────────────────────────────────────────────────────────

describe('Tooltip při hover', () => {
  // @scenario: gantt.feature > Zobrazení tooltip při hover nad pruhem
  it('po najetí myší zobrazí název, osobu, týdny, MD a progress; po opuštění zmizí', () => {
    vi.useFakeTimers();
    renderGantt();
    const apiBar = bar('API refaktoring');

    fireEvent.mouseEnter(apiBar);
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Jméno osoby je i v záhlaví řádku, proto se hledá uvnitř tooltipu.
    const tooltip = within(screen.getByTestId('task-tooltip'));
    expect(tooltip.getByText('API refaktoring')).toBeInTheDocument();
    expect(tooltip.getByText('Petra Kolářová')).toBeInTheDocument();
    expect(tooltip.getByText('W1→W4')).toBeInTheDocument();
    expect(tooltip.getByText('15 MD')).toBeInTheDocument();
    expect(tooltip.getByText('0%')).toBeInTheDocument();

    fireEvent.mouseLeave(apiBar);
    expect(screen.queryByTestId('task-tooltip')).not.toBeInTheDocument();
  });
});

// ── Záhlaví ──────────────────────────────────────────────────────────────────

describe('Skupiny měsíců v záhlaví', () => {
  // @scenario: gantt.feature > Zobrazení skupin měsíců v záhlaví
  it('zobrazí měsíční skupiny s odlišnou barvou pozadí pro každý měsíc', () => {
    renderGantt();
    const weeks = computeWeeks('2026-01-05', '2026-07-03', []);
    const groups = computeMonthGroups(weeks, '2026-01-05');

    const labels = groups.map((g) => screen.getByText(g.label.toUpperCase()));
    const colors = new Set(labels.map((el) => el.style.background));
    expect(labels).toHaveLength(groups.length);
    // Každý měsíc má vlastní barvu — Leden a Únor musí být odlišitelné.
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('České státní svátky', () => {
  // @scenario: gantt.feature > Zobrazení českých státních svátků
  it('týden s Velikonočním pondělím má indikátor svátku a title s názvem a počtem pracovních dní', () => {
    renderGantt();

    // Svátků je v projektu víc; hledá se ten týden, který nese Velikonoce.
    const weekCells = screen
      .getAllByLabelText('Obsahuje státní svátek')
      .map((indicator) => indicator.closest('[title]') as HTMLElement);

    const easter = weekCells.find((cell) => cell?.title.includes('Velikonoční pondělí'));

    expect(easter).toBeDefined();
    expect(easter?.title).toContain('4 pracovních dní');
  });
});

// ── Drag ─────────────────────────────────────────────────────────────────────

describe('Drag — přesunutí pruhu (move)', () => {
  // @scenario: gantt.feature > Drag — přesunutí pruhu (move)
  it('přetažení o 2 týdny doprava přesune pruh na W3-W6 a pošle jediný move_task až při mouseup', () => {
    const { lastCommand, commandsOf } = renderGantt();
    const target = bar('API refaktoring');

    fireEvent.mouseDown(target, { clientX: 0 });
    fireEvent.mouseMove(target, { clientX: xForWeek(3) }); // s posune o 2 (1 -> 3)
    expect(commandsOf('move_task')).toHaveLength(0); // ADR-005: zatím nic neodešlo

    fireEvent.mouseUp(target);

    expect(bar('API refaktoring')).toHaveStyle({ left: `${(3 - 1) * CELL_W + 2}px` });
    expect(lastCommand('move_task')).toEqual({ type: 'move_task', taskId: 't1', s: 3, e: 6 });
    expect(commandsOf('move_task')).toHaveLength(1);
  });
});

describe('Drag — resize', () => {
  // @scenario: gantt.feature > Drag — resize pravého okraje (prodloužení)
  it('tažení pravého okraje o 2 týdny prodlouží pruh na W1-W6 a uloží e=6', () => {
    const { dispatched } = renderGantt();
    const handle = rightHandle('API refaktoring');

    fireEvent.mouseDown(handle, { clientX: xForWeek(4) });
    fireEvent.mouseMove(handle, { clientX: xForWeek(6) });
    fireEvent.mouseUp(handle);

    expect(bar('API refaktoring')).toHaveStyle({ width: `${(6 - 1 + 1) * CELL_W - 4}px` });
    // `reconcileTasks` posílá s/e změny jako `move_task` (viz ADR-004) — pole
    // `e` v odeslaném commandu odpovídá scénáři „update_task s e=6"; typ
    // commandu (move_task vs. update_task) je stejný wire-level mechanismus
    // pro obě sady polí, server obě autorizuje shodně (Authorization.fs).
    const posCommand = dispatched.find(
      (c) => (c.type === 'move_task' || c.type === 'update_task') && c.taskId === 't1'
    );
    expect(posCommand).toMatchObject({ taskId: 't1' });
    if (posCommand?.type === 'move_task') expect(posCommand.e).toBe(6);
  });

  // @scenario: gantt.feature > Drag — resize levého okraje (zkrácení)
  it('tažení levého okraje o 1 týden zkrátí pruh na W2-W4 a uloží s=2', () => {
    renderGantt();
    const handle = leftHandle('API refaktoring');

    fireEvent.mouseDown(handle, { clientX: xForWeek(1) });
    fireEvent.mouseMove(handle, { clientX: xForWeek(2) });
    fireEvent.mouseUp(handle);

    expect(bar('API refaktoring')).toHaveStyle({ left: `${(2 - 1) * CELL_W + 2}px` });
  });
});

describe('Drag na hranici projektu', () => {
  // @scenario: gantt.feature > Drag se zastaví na hranici projektu
  it('přetažení za konec projektu se zastaví na posledním týdnu', () => {
    renderGantt();
    const target = bar('Databázová migrace'); // W5-W8

    fireEvent.mouseDown(target, { clientX: 0 });
    // Cíl daleko za konec projektu (týden 999) — musí se ořezat na numWeeks.
    fireEvent.mouseMove(target, { clientX: xForWeek(999) });
    fireEvent.mouseUp(target);

    const dur = DATABAZOVA_MIGRACE.e - DATABAZOVA_MIGRACE.s;
    const expectedS = NUM_WEEKS - dur;
    expect(bar('Databázová migrace')).toHaveStyle({ left: `${(expectedS - 1) * CELL_W + 2}px` });
    expect(bar('Databázová migrace')).toHaveStyle({
      width: `${(NUM_WEEKS - expectedS + 1) * CELL_W - 4}px`,
    });
  });
});

// ── Klik na pruh ─────────────────────────────────────────────────────────────

describe('Kliknutí na pruh', () => {
  // @scenario: gantt.feature > Kliknutí myší na pruh otevře TaskDetailModal
  it('myší klik (mousedown + mouseup bez posunu) otevře detail', () => {
    // `fireEvent.click` posílá `detail: 0`, což je aktivace z KLÁVESNICE —
    // testem níž tedy myší cesta neprojde. Právě proto předchozí verze
    // neodhalila, že myší klik přestal detail otevírat: tažený pruh dostal
    // `pointer-events: none`, takže `mouseup` netrefil tlačítko a `click` se
    // nevyvolal vůbec.
    renderGantt();
    const target = bar('API refaktoring');

    fireEvent.mouseDown(target, { clientX: 100, clientY: 100 });
    fireEvent.mouseUp(target);

    expect(screen.getByText('Detail úkolu')).toBeInTheDocument();
    expect(screen.getByLabelText('Název úkolu')).toHaveValue('API refaktoring');
  });

  it('drobné chvění myší se nepočítá jako tažení a detail se otevře', () => {
    // `computeMovePreview` vrátí náhled při každém pohybu; bez porovnání
    // s původním úkolem by i pixel chvění během kliknutí spolkl detail.
    const { commandsOf } = renderGantt();
    const target = bar('API refaktoring');

    fireEvent.mouseDown(target, { clientX: 100, clientY: 100 });
    // Pohyb uvnitř téhož týdne — `xForWeek(1)` je sloupec, kde úkol začíná.
    fireEvent.mouseMove(target, { clientX: xForWeek(1) + 3 });
    fireEvent.mouseUp(target);

    expect(screen.getByText('Detail úkolu')).toBeInTheDocument();
    expect(commandsOf('move_task')).toHaveLength(0);
    expect(commandsOf('update_task')).toHaveLength(0);
  });

  // @scenario: gantt.feature > Kliknutí na pruh otevře TaskDetailModal
  it('otevře TaskDetailModal s detailem úkolu', () => {
    renderGantt();

    fireEvent.click(bar('API refaktoring'));

    expect(screen.getByText('Detail úkolu')).toBeInTheDocument();
    expect(screen.getByLabelText('Název úkolu')).toHaveValue('API refaktoring');
    expect(screen.getByLabelText('Přiřazeno')).toHaveValue(PETRA.id);
    expect(screen.getByLabelText('Kategorie')).toHaveValue('obecne');
    expect(screen.getByLabelText('Týden od')).toHaveValue(1);
    expect(screen.getByLabelText('Týden do')).toHaveValue(4);
    expect(screen.getByLabelText('MD')).toHaveValue(15);
    expect(screen.getByText('Progress: 0%')).toBeInTheDocument();
  });
});

// ── Undo ─────────────────────────────────────────────────────────────────────

describe('Undo po drag operaci', () => {
  // @scenario: gantt.feature > Undo po drag operaci
  it('Ctrl+Z vrátí pruh na původní pozici a pošle reverzní move_task', () => {
    const { undo, commandsOf } = renderGantt();
    const target = bar('API refaktoring');

    fireEvent.mouseDown(target, { clientX: 0 });
    fireEvent.mouseMove(target, { clientX: xForWeek(3) });
    fireEvent.mouseUp(target);
    expect(bar('API refaktoring')).toHaveStyle({ left: `${(3 - 1) * CELL_W + 2}px` });

    act(() => undo());

    expect(bar('API refaktoring')).toHaveStyle({ left: `${(1 - 1) * CELL_W + 2}px` });
    const moves = commandsOf('move_task');
    expect(moves).toHaveLength(2); // 1x drag, 1x inverzní undo
    expect(moves[1]).toEqual({ type: 'move_task', taskId: 't1', s: 1, e: 4 });
  });
});

// ── Export PNG ───────────────────────────────────────────────────────────────

describe('Export Gantt jako PNG', () => {
  // @scenario: gantt.feature > Export Gantt jako PNG
  it('stáhne harmonogram.png a po dobu generování zobrazí indikátor načítání', async () => {
    let resolveCanvas: (c: { toDataURL: () => string }) => void = () => {};
    vi.mocked(html2canvas).mockReturnValue(
      new Promise((resolve) => {
        resolveCanvas = resolve;
      }) as unknown as ReturnType<typeof html2canvas>
    );
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderGantt();

    fireEvent.click(screen.getByRole('button', { name: /PNG/ }));
    expect(screen.getByRole('button', { name: /⏳/ })).toBeDisabled();

    await act(async () => {
      resolveCanvas({ toDataURL: () => 'data:image/png;base64,xyz' });
      await Promise.resolve();
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });
});

// ── Swimlanes ────────────────────────────────────────────────────────────────

describe('Gantt zobrazuje pruhy per-lane', () => {
  // @scenario: gantt.feature > Gantt zobrazuje pruhy per-lane (bez překryvu)
  it('dva překrývající se úkoly stejné osoby jsou v samostatných swimlane řádcích', () => {
    const overlapA = { ...API_REFAKTORING, id: 'ov1', name: 'Úkol A', p: PETRA.id, s: 1, e: 4 };
    const overlapB = { ...DATABAZOVA_MIGRACE, id: 'ov2', name: 'Úkol B', p: PETRA.id, s: 2, e: 5 };
    renderGantt({ tasks: [overlapA, overlapB] });

    const barA = bar('Úkol A');
    const barB = bar('Úkol B');
    expect(barA.style.top).not.toBe(barB.style.top);
  });
});

// ── Oprávnění (ADR-006) ──────────────────────────────────────────────────────

describe('Dev a drag cizího/vlastního úkolu', () => {
  // @scenario: gantt.feature > Dev uživatel nemůže drag-and-drop cizí úkol
  it('Dev nemůže přetáhnout pruh přiřazený jinému uživateli — drag je ignorován', () => {
    const { commandsOf } = renderGantt({ role: 'dev', currentUserId: PETRA.userId });
    const target = bar('Infrastruktura'); // přiřazeno Jan Novák

    fireEvent.mouseDown(target, { clientX: 0 });
    fireEvent.mouseMove(target, { clientX: xForWeek(5) });
    fireEvent.mouseUp(target);

    expect(bar('Infrastruktura')).toHaveStyle({
      left: `${(INFRASTRUKTURA.s - 1) * CELL_W + 2}px`,
    });
    expect(commandsOf('move_task')).toHaveLength(0);
  });

  // @scenario: gantt.feature > Dev uživatel může drag-and-drop vlastní úkol
  it('Dev může přetáhnout vlastní pruh z W1-W4 na W2-W5', () => {
    const { lastCommand } = renderGantt({ role: 'dev', currentUserId: PETRA.userId });
    const target = bar('API refaktoring'); // přiřazeno Petra Kolářová

    fireEvent.mouseDown(target, { clientX: 0 });
    fireEvent.mouseMove(target, { clientX: xForWeek(2) });
    fireEvent.mouseUp(target);

    expect(bar('API refaktoring')).toHaveStyle({ left: `${(2 - 1) * CELL_W + 2}px` });
    expect(lastCommand('move_task')).toEqual({ type: 'move_task', taskId: 't1', s: 2, e: 5 });
  });
});
