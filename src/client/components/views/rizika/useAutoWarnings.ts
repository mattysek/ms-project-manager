// Automatická varování odvozená z aktuálního plánu — zatím jen přetížení
// osob (MD nad kapacitu v nejhorším týdnu). Kritická cesta je připravený typ
// (`AutoWarning['type']`), ale zatím se negeneruje.
import { useMemo } from 'react';
import type { Person, Roles, Severity, Task, Week } from '../../../types';
import type { AutoWarning } from './AutoWarningCard';

interface OverallocatedWeek {
  weekIdx: number;
  assigned: number;
  available: number;
  taskNames: string[];
}

/** Závažnost auto-varování z míry přetížení (MD nad kapacitu v nejhorším týdnu). */
function overallocationSeverity(maxOverMD: number): Severity {
  if (maxOverMD > 2) return 'high';
  return maxOverMD > 1 ? 'med' : 'low';
}

/** Skloňování „týdnu/týdnech" v auto-varování o přetížení. */
function weekCountWord(count: number): string {
  return count === 1 ? 'u' : 'ech';
}

interface AssignedMDArgs {
  person: Person;
  week: Week;
  wIdx: number;
  tasks: Task[];
  weeks: Week[];
}

/** MD přiřazené osobě v jednom týdnu, rozpočítané proporčně dle pracovních dnů úkolu. */
function assignedMDInWeek({ person, week, wIdx, tasks, weeks }: AssignedMDArgs) {
  const personTasks = tasks.filter((t) => t.p === person.id && t.s <= wIdx + 1 && t.e >= wIdx + 1);
  let assigned = 0;
  const taskNames: string[] = [];
  for (const t of personTasks) {
    const taskWeekIndices = Array.from({ length: t.e - t.s + 1 }, (_, i) => t.s - 1 + i);
    const totalTaskWorkdays = taskWeekIndices.reduce(
      (sum, idx) => sum + (weeks[idx]?.workdays ?? 0),
      0
    );
    assigned += totalTaskWorkdays > 0 ? (t.md * week.workdays) / totalTaskWorkdays : 0;
    taskNames.push(t.name);
  }
  return { assigned, taskNames };
}

/** Týdny, ve kterých je osoba přetížená (přiřazeno víc MD, než má kapacitu). */
function personOverallocatedWeeks(
  person: Person,
  weeks: Week[],
  tasks: Task[]
): OverallocatedWeek[] {
  const overallocatedWeeks: OverallocatedWeek[] = [];
  weeks.forEach((week, wIdx) => {
    const alloc = person.weekAlloc[wIdx] ?? 100;
    const available = (week.workdays * alloc) / 100;
    const { assigned, taskNames } = assignedMDInWeek({ person, week, wIdx, tasks, weeks });
    if (assigned > available + 0.1) {
      overallocatedWeeks.push({ weekIdx: wIdx, assigned, available, taskNames });
    }
  });
  return overallocatedWeeks;
}

/** Sestaví text a závažnost auto-varování o přetížení jedné osoby. */
function buildOverallocationWarning(
  person: Person,
  overallocatedWeeks: OverallocatedWeek[],
  weeks: Week[],
  roles: Roles
): AutoWarning {
  const weekDetails = overallocatedWeeks
    .map((ow) => {
      const week = weeks[ow.weekIdx];
      const overBy = Math.round((ow.assigned - ow.available) * 10) / 10;
      const uniqueTasks = [...new Set(ow.taskNames)];
      return `• ${week.label}: přetížení o ${overBy} MD (${uniqueTasks.join(', ')})`;
    })
    .join('\n');

  const maxOver = Math.max(...overallocatedWeeks.map((ow) => ow.assigned - ow.available));
  const roleLabel = roles[person.role]?.label || person.role;
  const weekWord = weekCountWord(overallocatedWeeks.length);

  return {
    type: 'overallocation',
    severity: overallocationSeverity(maxOver),
    title: `Přetížení: ${person.name}`,
    detail: `${person.name} (${roleLabel}) je přetížen/a v ${overallocatedWeeks.length} týdn${weekWord}:\n\n${weekDetails}`,
  };
}

interface UseAutoWarningsArgs {
  people: Person[];
  tasks: Task[];
  weeks: Week[];
  roles: Roles;
}

/** Odvodí auto-varování (zatím jen přetížení osob) z aktuálního plánu. */
export function useAutoWarnings({
  people,
  tasks,
  weeks,
  roles,
}: UseAutoWarningsArgs): AutoWarning[] {
  return useMemo<AutoWarning[]>(() => {
    if (!weeks.length || !people.length) return [];
    const warnings: AutoWarning[] = [];
    for (const person of people) {
      const overallocatedWeeks = personOverallocatedWeeks(person, weeks, tasks);
      if (overallocatedWeeks.length > 0) {
        warnings.push(buildOverallocationWarning(person, overallocatedWeeks, weeks, roles));
      }
    }
    return warnings;
  }, [people, tasks, weeks, roles]);
}
