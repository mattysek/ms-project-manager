// Odvozená data z projektu — čisté `useMemo` výpočty, žádná mutace (ADR-005:
// týdny/lanes/součty zůstávají na klientovi). Vytaženo z App.tsx, aby tam
// zůstala jen kompozice (ADR-012 rozpočty na délku/složitost funkce).
import { useMemo } from 'react';
import {
  computeWeeks,
  computeMonthGroups,
  injectWeeks,
  buildLanes,
  personTotalMD,
  plannedMD,
} from '../utils';
import type {
  Person,
  Project,
  Task,
  TaskWithLane,
  Week,
  MonthGroup,
  PersonWithWeeks,
} from '../types';

export interface ProjectDerivedData {
  weeks: Week[];
  monthGroups: MonthGroup[];
  numWeeks: number;
  people: PersonWithWeeks[];
  lanes: Record<string, TaskWithLane[]>;
  /** Dostupná kapacita týmu v MD (alokace × pracovní dny). */
  grand: number;
  /** Naplánovaná práce v MD — součet `task.md` včetně backlogu. */
  planned: number;
  /** `planned − budget`; kladné číslo znamená víc práce, než na kolik jsou peníze. */
  plannedDiff: number;
  overallProgress: number;
}

export function useProjectDerivedData(
  project: Project,
  tasks: Task[],
  rawPeople: Person[]
): ProjectDerivedData {
  const weeks = useMemo(
    () => computeWeeks(project.startDate, project.endDate, project.milestones),
    [project.startDate, project.endDate, project.milestones]
  );
  const monthGroups = useMemo(
    () => computeMonthGroups(weeks, project.startDate),
    [weeks, project.startDate]
  );
  const people = useMemo(() => injectWeeks(rawPeople, weeks), [rawPeople, weeks]);
  const lanes = useMemo(() => buildLanes(tasks, people), [tasks, people]);
  const grand = useMemo(
    () => Math.round(people.reduce((s, p) => s + personTotalMD(p), 0) * 10) / 10,
    [people]
  );
  const planned = useMemo(() => plannedMD(tasks), [tasks]);
  const overallProgress = useMemo(() => {
    const totalMD = tasks.reduce((s, t) => s + t.md, 0);
    if (totalMD === 0) return 0;
    const completedMD = tasks.reduce((s, t) => s + ((t.progress ?? 0) * t.md) / 100, 0);
    return Math.round((completedMD / totalMD) * 100);
  }, [tasks]);

  return {
    weeks,
    monthGroups,
    numWeeks: weeks.length,
    people,
    lanes,
    grand,
    planned,
    plannedDiff: Math.round((planned - project.budget) * 10) / 10,
    overallProgress,
  };
}
