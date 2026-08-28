// „Moje práce" — posun na aktuální týden (my-work.feature, FR-WORK-07).
//
// Že se stránka opravdu odroluje, ověří až E2E — jsdom nemá layout a
// `scrollIntoView` je v `test/setup.ts` jen atrapa. Tady se testuje to, co
// atrapa unese: že se volá nad **tím správným** týdnem a jen jednou.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyWorkPage } from './MyWorkPage';
import * as workloadApi from '../../api/workloadApi';
import type { MyTask } from '../../api/workloadApi';
import { addDays, toISO, weekMonday } from '../../utils';

/** Pondělí týdne posunutého o `weeks` od dneška. */
function mondayOffset(weeks: number): string {
  return toISO(addDays(weekMonday(new Date()), weeks * 7));
}

function task(over: Partial<MyTask> & Pick<MyTask, 'taskId'>): MyTask {
  return {
    projectId: 'p1',
    projectName: 'Backend refaktoring',
    name: `Úkol ${over.taskId}`,
    cat: 'obecne',
    md: 1,
    progress: 0,
    ...over,
  };
}

/** Úkol ležící celý v jednom týdnu. */
function inWeek(taskId: string, weeks: number): MyTask {
  const monday = mondayOffset(weeks);
  return task({
    taskId,
    fromIso: monday,
    toIso: toISO(addDays(weekMonday(new Date()), weeks * 7 + 4)),
  });
}

function mockWorkload(tasks: MyTask[]) {
  vi.spyOn(workloadApi, 'fetchMyWorkload').mockResolvedValue({ staleAfterSeconds: 5, tasks });
}

/** Zaznamená, nad kterým prvkem se scrollovalo. */
function spyScroll() {
  const targets: string[] = [];
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
    targets.push(this.textContent ?? '');
  });
  return targets;
}

let scrolled: string[];

beforeEach(() => {
  scrolled = spyScroll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MyWorkPage — posun na aktuální týden', () => {
  // @scenario: my-work.feature > Přehled začíná na aktuálním týdnu
  it('posune se na aktuální týden, i když jsou v seznamu minulé', async () => {
    mockWorkload([inWeek('t-stary', -6), inWeek('t-ted', 0), inWeek('t-pristi', 3)]);

    render(<MyWorkPage onBack={vi.fn()} onOpenTask={vi.fn()} />);

    await screen.findByText('tento týden');
    // Scrollovalo se na kartu aktuálního týdne, ne na první v pořadí.
    await waitFor(() => expect(scrolled).toHaveLength(1));
    expect(scrolled[0]).toContain('tento týden');
  });

  // @scenario: my-work.feature > Přehled začíná na aktuálním týdnu
  it('aktuální týden je označený, ostatní ne', async () => {
    mockWorkload([inWeek('t-stary', -6), inWeek('t-ted', 0)]);

    render(<MyWorkPage onBack={vi.fn()} onOpenTask={vi.fn()} />);

    // Označení je právě jedno — jinak by se posun nedal vysvětlit.
    expect(await screen.findAllByText('tento týden')).toHaveLength(1);
  });

  // @scenario: my-work.feature > Bez práce v aktuálním týdnu se přehled posune na nejbližší další
  it('bez práce tento týden se posune na nejbližší příští', async () => {
    mockWorkload([inWeek('t-stary', -4), inWeek('t-za-dva', 2)]);

    render(<MyWorkPage onBack={vi.fn()} onOpenTask={vi.fn()} />);

    await screen.findByText(/Úkol t-za-dva/);
    await waitFor(() => expect(scrolled).toHaveLength(1));
    // Dopředu, ne dozadu — kdo se dívá na svou práci, dívá se dopředu.
    expect(scrolled[0]).toContain('Úkol t-za-dva');
    expect(screen.queryByText('tento týden')).not.toBeInTheDocument();
  });

  it('když je všechno v minulosti, posune se na poslední týden', async () => {
    mockWorkload([inWeek('t-nejstarsi', -8), inWeek('t-posledni', -2)]);

    render(<MyWorkPage onBack={vi.fn()} onOpenTask={vi.fn()} />);

    await screen.findByText(/Úkol t-posledni/);
    await waitFor(() => expect(scrolled).toHaveLength(1));
    expect(scrolled[0]).toContain('Úkol t-posledni');
  });

  it('prázdný přehled nescrolluje nikam', async () => {
    mockWorkload([]);

    render(<MyWorkPage onBack={vi.fn()} onOpenTask={vi.fn()} />);

    await screen.findByText(/Nemáte přiřazený žádný úkol/);
    expect(scrolled).toHaveLength(0);
  });

  // @scenario: my-work.feature > Ruční obnovení uživatele neodroluje zpátky
  it('Obnovit už podruhé nescrolluje', async () => {
    mockWorkload([inWeek('t-ted', 0)]);
    render(<MyWorkPage onBack={vi.fn()} onOpenTask={vi.fn()} />);
    await screen.findByText('tento týden');
    await waitFor(() => expect(scrolled).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: /Obnovit/ }));

    // Uživatel si mezitím mohl odrolovat jinam; obnovení dat ho tam má nechat.
    await waitFor(() => expect(workloadApi.fetchMyWorkload).toHaveBeenCalledTimes(2));
    expect(scrolled).toHaveLength(1);
  });
});
