// Přetížení osoby v týdnu — porovnává alokovanou kapacitu s rozpadem MD úkolů.
import { useMemo } from 'react';
import type { PersonWithWeeks, Task, Week } from '../../../types';

/** MD úkolu připadající na jeden týden — rozdělené podle počtu pracovních dní. */
function taskMDInWeek(task: Task, week: Week, weeks: Week[]): number {
  if (task.s > week.w || task.e < week.w) return 0;
  const totalWorkdays = Array.from(
    { length: task.e - task.s + 1 },
    (_, i) => weeks[task.s - 1 + i]?.workdays ?? 0
  ).reduce((sum, wd) => sum + wd, 0);
  return totalWorkdays > 0 ? (task.md * week.workdays) / totalWorkdays : 0;
}

function overallocatedWeeksFor(person: PersonWithWeeks, tasks: Task[], weeks: Week[]): Set<number> {
  const personTasks = tasks.filter((t) => t.p === person.id);
  const result = new Set<number>();
  for (const week of weeks) {
    const availableMD = ((person.weekAlloc?.[week.w - 1] ?? 100) / 100) * week.workdays;
    const assignedMD = personTasks.reduce((sum, t) => sum + taskMDInWeek(t, week, weeks), 0);
    // Malá tolerance kvůli zaokrouhlení při rozpadu MD na týdny.
    if (assignedMD > availableMD + 0.1) result.add(week.w);
  }
  return result;
}

/** Mapa `personId → přetížené týdny (1-based)`; osoby bez přetížení chybí. */
export function useOverallocation(people: PersonWithWeeks[], tasks: Task[], weeks: Week[]) {
  return useMemo(() => {
    const result = new Map<string, Set<number>>();
    for (const person of people) {
      const weeksOver = overallocatedWeeksFor(person, tasks, weeks);
      if (weeksOver.size > 0) result.set(person.id, weeksOver);
    }
    return result;
  }, [people, tasks, weeks]);
}
