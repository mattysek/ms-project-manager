// Přetížení osob po týdnech.
//
// Do téhle chvíle uměla Kapacita porovnat jen *celkovou* kapacitu osoby proti
// *celkové* přiřazené práci. To odpovídá na „má Petra dost práce", ale ne na
// otázku, kvůli které se kapacitní plán dělá: „je Petra ve W5 přetížená?"
// Součty totiž nevidí, že je někdo zavalený v březnu a nemá nic v květnu.
import { useMemo } from 'react';
import type { PersonWithWeeks, Task, Week } from '../../../types';
import { weekMD } from '../../../utils';

/** Zatížení jedné osoby v jednom týdnu. */
export interface WeekLoad {
  /** Dostupné MD — pracovní dny týdne × alokace osoby. */
  capacity: number;
  /** Přiřazené MD z úkolů, které do týdne zasahují. */
  demand: number;
}

export interface WeeklyLoad {
  /** `personId` → pole podle indexu týdne. */
  byPerson: Record<string, WeekLoad[]>;
  /** Indexy týdnů, kde je aspoň jedna osoba přetížená — vzestupně. */
  overloadedWeeks: number[];
}

/**
 * Tolerance v MD. Alokace i pracovní dny se zaokrouhlují na desetiny, takže
 * bez ní by se jako přetížení hlásily rozdíly typu 5.0 vs 5.000000001.
 */
const EPSILON = 0.05;

/**
 * Rozprostře MD úkolu přes týdny, do kterých zasahuje, **poměrně podle
 * pracovních dnů**. Rovnoměrné dělení by zkrácenému svátečnímu týdnu
 * přiřadilo stejnou porci jako plnému, což je přesně ta chyba, kterou
 * u kapacity opravujeme jinde.
 *
 * `task.s`/`task.e` jsou 1-based (ADR-014), klíče výsledné mapy jsou indexy
 * do `weeks`. Dokud se tady počítalo 0-based, hlásila Kapacita přetížení
 * o týden později než Gantt a práce v posledním týdnu se ztratila úplně.
 */
function spreadTaskAcrossWeeks(task: Task, weeks: Week[]): Map<number, number> {
  const spread = new Map<number, number>();
  const first = Math.max(0, task.s - 1);
  const last = Math.min(weeks.length - 1, task.e - 1);
  if (last < first) return spread;

  let workdaysTotal = 0;
  for (let i = first; i <= last; i++) workdaysTotal += weeks[i]?.workdays ?? 0;

  // Úkol jen přes svátky/víkendy: rozdělíme rovnoměrně, ať práce nezmizí.
  const evenShare = task.md / (last - first + 1);

  for (let i = first; i <= last; i++) {
    const share =
      workdaysTotal > 0 ? (task.md * (weeks[i]?.workdays ?? 0)) / workdaysTotal : evenShare;
    spread.set(i, (spread.get(i) ?? 0) + share);
  }
  return spread;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Prázdná mřížka osoba × týden, naplněná dostupnou kapacitou. */
function emptyGrid(people: PersonWithWeeks[], weeks: Week[]): Record<string, WeekLoad[]> {
  const byPerson: Record<string, WeekLoad[]> = {};
  for (const person of people) {
    byPerson[person.id] = weeks.map((_, wi) => ({ capacity: weekMD(person, wi), demand: 0 }));
  }
  return byPerson;
}

/** Nasype MD úkolů do mřížky. Backlog a osoby mimo projekt se ignorují. */
function accumulateDemand(grid: Record<string, WeekLoad[]>, tasks: Task[], weeks: Week[]): void {
  for (const task of tasks) {
    const row = grid[task.p];
    if (!row) continue;
    for (const [wi, share] of spreadTaskAcrossWeeks(task, weeks)) {
      const cell = row[wi];
      if (cell) cell.demand += share;
    }
  }
}

/** Zaokrouhlí poptávku a vrátí indexy týdnů, kde někdo přesáhl kapacitu. */
function findOverloadedWeeks(grid: Record<string, WeekLoad[]>): number[] {
  const overloaded = new Set<number>();
  for (const row of Object.values(grid)) {
    row.forEach((cell, wi) => {
      cell.demand = round1(cell.demand);
      if (cell.demand > cell.capacity + EPSILON) overloaded.add(wi);
    });
  }
  return [...overloaded].sort((a, b) => a - b);
}

export function useWeeklyLoad(people: PersonWithWeeks[], tasks: Task[], weeks: Week[]): WeeklyLoad {
  return useMemo(() => {
    const byPerson = emptyGrid(people, weeks);
    accumulateDemand(byPerson, tasks, weeks);
    return { byPerson, overloadedWeeks: findOverloadedWeeks(byPerson) };
  }, [people, tasks, weeks]);
}
