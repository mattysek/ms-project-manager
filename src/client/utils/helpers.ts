import type { Person, PersonWithWeeks, Task, TaskWithLane, Week, Category } from '../types';

/**
 * Barva zobrazení procentuálního postupu (0–100 %) — 100 % zeleně,
 * rozpracováno žlutě, nezačato šedě. Sdíleno mezi Header a TaskDetailModal.
 */
export function progressColor(progress: number): string {
  if (progress === 100) return '#34d399';
  if (progress > 0) return '#fbbf24';
  return '#475569';
}

/**
 * Naplánovaná práce projektu — součet MD **všech** úkolů, backlog včetně.
 *
 * Odpovídá na „vejde se to, co chceme udělat, do rozpočtu?". To je jiná otázka
 * než `personTotalMD`/`grand`, které sčítají *dostupnou kapacitu* lidí — proti
 * rozpočtu se dřív porovnávala jenom ta, takže hlavička hlásila „nad rozpočtem"
 * ve chvíli, kdy měl tým víc lidí, než rozpočet platí, a naopak mlčela, když se
 * naplánovalo víc práce, než na kolik jsou peníze.
 *
 * Backlog se počítá schválně: nepřiřazený úkol je pořád práce, kterou někdo
 * odvede, jen se zatím neví kdo.
 *
 * Žije v `helpers.ts`, aby ho hlavička (`useProjectDerivedData`) i Kapacita
 * (`useCapacityTotals`) braly ze stejného místa a nemohly se rozejít.
 */
export function plannedMD(tasks: Task[]): number {
  return Math.round(tasks.reduce((sum, task) => sum + Number(task.md), 0) * 10) / 10;
}

/**
 * Calculate man-days for a person in a specific week
 */
export function weekMD(person: PersonWithWeeks, wIdx: number): number {
  const a = person.weekAlloc[wIdx] ?? 0;
  return Math.round((person._weeks[wIdx]?.workdays ?? 0) * (a / 100) * 10) / 10 || 0;
}

/**
 * Calculate total man-days for a person
 */
export function personTotalMD(person: PersonWithWeeks): number {
  if (!person._weeks) return 0;
  return (
    Math.round(
      person.weekAlloc.reduce((s, a, i) => {
        const wd = person._weeks[i]?.workdays || 0;
        return s + wd * (a / 100);
      }, 0) * 10
    ) / 10
  );
}

/**
 * Inject weeks info into people array
 */
export function injectWeeks(people: Person[], weeks: Week[]): PersonWithWeeks[] {
  return people.map((p) => ({
    ...p,
    _weeks: weeks,
    weekAlloc: weeks.map((_, i) => p.weekAlloc[i] ?? 100),
  }));
}

/**
 * Assign lanes to tasks for Gantt chart visualization
 */
export function assignLanes(tasks: Task[]): TaskWithLane[] {
  const sorted = [...tasks].sort((a, b) => a.s - b.s || a.e - b.e);
  const ends: number[] = [];
  return sorted.map((t) => {
    let l = ends.findIndex((e) => e < t.s);
    if (l === -1) {
      l = ends.length;
      ends.push(0);
    }
    ends[l] = t.e;
    return { ...t, lane: l };
  });
}

/**
 * Build lanes for all people
 */
export function buildLanes(
  tasks: Task[],
  people: PersonWithWeeks[]
): Record<string, TaskWithLane[]> {
  const by: Record<string, Task[]> = {};
  people.forEach((p) => {
    by[p.id] = [];
  });
  tasks.forEach((t) => {
    if (by[t.p]) by[t.p].push(t);
  });
  const r: Record<string, TaskWithLane[]> = {};
  people.forEach((p) => {
    r[p.id] = assignLanes(by[p.id]);
  });
  return r;
}

/**
 * Generate unique ID
 */
export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Guess link label from URL
 */
export function guessLabel(url: string): string {
  if (!url) return 'Odkaz';
  if (/jira/i.test(url)) return 'Jira';
  if (/dev\.azure|tfs/i.test(url)) return 'Azure DevOps';
  if (/github/i.test(url)) return 'GitHub';
  if (/confluence/i.test(url)) return 'Confluence';
  return 'Odkaz';
}

/**
 * Derive category styling from hex color
 */
export function deriveCat(hex: string, label: string): Category {
  return {
    bg: `${hex}18`,
    bd: hex,
    tx: `${hex}dd`,
    label,
  };
}
