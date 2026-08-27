// Přetížení osob po týdnech (kapacita.feature) — čistý výpočet bez UI.
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeWeeks, injectWeeks } from '../../../utils';
import type { Person, Task } from '../../../types';
import { useWeeklyLoad } from './useWeeklyLoad';
import { useOverallocation } from '../gantt/useOverallocation';

const PETRA: Person = {
  id: 'petra',
  userId: null,
  name: 'Petra Kolářová',
  role: 'BE',
  color: '#34d399',
  weekAlloc: [],
};

const JAN: Person = {
  id: 'jan',
  userId: null,
  name: 'Jan Novák',
  role: 'AR',
  color: '#4f9cf9',
  weekAlloc: [],
};

function task(over: Partial<Task> & Pick<Task, 'id' | 'p' | 's' | 'e' | 'md'>): Task {
  return {
    name: 'Úkol',
    cat: 'obecne',
    progress: 0,
    desc: '',
    links: [],
    ...over,
  };
}

/** Týdny bez svátků, ať jsou čísla v testech čitelná (5 pracovních dní). */
function cleanWeeks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    w: i + 1,
    label: `W${i + 1}`,
    dl: null,
    mIdx: Math.floor(i / 4),
    workdays: 5,
    mondayISO: '2026-01-05',
    fridayISO: '2026-01-09',
  }));
}

function loadOf(people: Person[], tasks: Task[], weekCount = 8) {
  const weeks = cleanWeeks(weekCount);
  const withWeeks = injectWeeks(
    people.map((p) => ({ ...p, weekAlloc: Array(weekCount).fill(100) })),
    weeks
  );
  return renderHook(() => useWeeklyLoad(withWeeks, tasks, weeks)).result.current;
}

// `s`/`e` jsou 1-based (ADR-014), klíče v `byPerson` jsou indexy do `weeks`.
// Původní podoba tohohle souboru počítala 0-based a chybu tím zafixovávala:
// nad `s: 4, e: 4` stál komentář „Úkol na jeden týden (W5)".
describe('useWeeklyLoad', () => {
  // @scenario: kapacita.feature > Přetížení osoby v konkrétním týdnu
  it('označí týden, kde přiřazená práce přesáhne kapacitu', () => {
    // Úkol na jeden týden (W5) za 8 MD proti kapacitě 5 MD.
    const load = loadOf([PETRA], [task({ id: 't1', p: 'petra', s: 5, e: 5, md: 8 })]);

    const week5 = load.byPerson.petra?.[4];
    expect(week5?.capacity).toBe(5);
    expect(week5?.demand).toBe(8);
    expect(load.overloadedWeeks).toContain(4);
  });

  // @scenario: kapacita.feature > Nevyužitá kapacita v týdnu
  it('týden bez přiřazené práce má nulovou poptávku, ale kapacitu drží', () => {
    const load = loadOf([JAN], [task({ id: 't1', p: 'jan', s: 1, e: 1, md: 5 })]);

    const week7 = load.byPerson.jan?.[6];
    expect(week7?.capacity).toBe(5);
    expect(week7?.demand).toBe(0);
    expect(load.overloadedWeeks).toHaveLength(0);
  });

  // @scenario: kapacita.feature > Práce v posledním týdnu projektu se započítá
  it('započítá i úkol v posledním týdnu projektu', () => {
    // Osmitýdenní projekt, úkol v W8. Dokud se `s`/`e` četly jako indexy pole,
    // spadl mimo rozsah a zatížení posledního týdne zůstalo nulové.
    const load = loadOf([PETRA], [task({ id: 't1', p: 'petra', s: 8, e: 8, md: 8 })]);

    expect(load.byPerson.petra?.[7]?.demand).toBe(8);
    expect(load.overloadedWeeks).toContain(7);
  });

  it('rozprostře MD úkolu přes všechny jeho týdny', () => {
    // 10 MD přes W1–W2 = 5 MD na týden, tedy přesně kapacita.
    const load = loadOf([PETRA], [task({ id: 't1', p: 'petra', s: 1, e: 2, md: 10 })]);

    expect(load.byPerson.petra?.[0]?.demand).toBe(5);
    expect(load.byPerson.petra?.[1]?.demand).toBe(5);
    expect(load.overloadedWeeks).toHaveLength(0);
  });

  it('sečte překrývající se úkoly téže osoby', () => {
    const load = loadOf(
      [PETRA],
      [
        task({ id: 't1', p: 'petra', s: 1, e: 2, md: 6 }),
        task({ id: 't2', p: 'petra', s: 2, e: 3, md: 6 }),
      ]
    );

    // W2 nese polovinu obou úkolů = 6 MD proti kapacitě 5.
    expect(load.byPerson.petra?.[1]?.demand).toBe(6);
    expect(load.overloadedWeeks).toEqual([1]);
  });

  it('úkoly bez osoby (backlog) se do zatížení nepočítají', () => {
    const load = loadOf([PETRA], [task({ id: 't1', p: '', s: 1, e: 1, md: 50 })]);

    expect(load.byPerson.petra?.[0]?.demand).toBe(0);
    expect(load.overloadedWeeks).toHaveLength(0);
  });

  it('zkrácený sváteční týden dostane menší porci práce než plný', () => {
    // Reálný kalendář jara 2026. Velký pátek (3. 4.) a Velikonoční pondělí
    // (6. 4.) zkracují dva týdny po sobě, takže hledáme zkrácený týden, po
    // kterém následuje plný — jinak by se neměly co porovnávat.
    const weeks = computeWeeks('2026-01-05', '2026-06-26');
    const holidayIdx = weeks.findIndex((w, i) => w.workdays === 4 && weeks[i + 1]?.workdays === 5);
    expect(holidayIdx).toBeGreaterThan(-1);

    const people = injectWeeks([{ ...PETRA, weekAlloc: Array(weeks.length).fill(100) }], weeks);
    const spread = task({
      id: 't1',
      p: 'petra',
      s: holidayIdx + 1,
      e: holidayIdx + 2,
      md: 9,
    });
    const load = renderHook(() => useWeeklyLoad(people, [spread], weeks)).result.current;

    const shortWeek = load.byPerson.petra?.[holidayIdx]?.demand ?? 0;
    const fullWeek = load.byPerson.petra?.[holidayIdx + 1]?.demand ?? 0;
    expect(shortWeek).toBeLessThan(fullWeek);
    expect(shortWeek + fullWeek).toBeCloseTo(9, 1);
  });

  // @scenario: kapacita.feature > Přetížení sedí na stejném týdnu jako v Ganttu
  it('hlásí stejné týdny jako přetížení v Ganttu', () => {
    // Dva pohledy na tutéž otázku — Kapacita vrací indexy do `weeks`, Gantt
    // 1-based `week.w`. Dokud se rozcházely v bázi, ukazovala každá záložka
    // jiný týden, aniž by to kterýkoli test viděl.
    const weeks = cleanWeeks(8);
    const people = injectWeeks([{ ...PETRA, weekAlloc: Array(8).fill(100) }], weeks);
    const tasks = [
      task({ id: 't1', p: 'petra', s: 3, e: 3, md: 8 }),
      task({ id: 't2', p: 'petra', s: 8, e: 8, md: 9 }),
    ];

    const load = renderHook(() => useWeeklyLoad(people, tasks, weeks)).result.current;
    const gantt = renderHook(() => useOverallocation(people, tasks, weeks)).result.current;

    const fromGantt = [...(gantt.get('petra') ?? [])].sort((a, b) => a - b);
    expect(load.overloadedWeeks.map((i) => i + 1)).toEqual(fromGantt);
    expect(fromGantt).toEqual([3, 8]);
  });
});
