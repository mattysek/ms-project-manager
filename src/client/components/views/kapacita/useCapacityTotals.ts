// Odvozené součty kapacit — nikdy se neukládají, počítají se z osob a úkolů.
import { useMemo } from 'react';
import type { PersonWithWeeks, Roles, Task, Week } from '../../../types';
import { personTotalMD, plannedMD, weekMD } from '../../../utils';

/** Zaokrouhlení na jedno desetinné místo — MD se všude zobrazují takhle. */
const round1 = (n: number) => Math.round(n * 10) / 10;

export function useCapacityTotals(
  people: PersonWithWeeks[],
  tasks: Task[],
  weeks: Week[],
  roles: Roles
) {
  return useMemo(() => {
    const grand = round1(people.reduce((s, p) => s + personTotalMD(p), 0));
    const weekTotals = weeks.map((_, i) => round1(people.reduce((s, p) => s + weekMD(p, i), 0)));

    // Přiřazená práce na osobu — jen za osoby, které v projektu skutečně jsou.
    const personDemand: Record<string, number> = {};
    people.forEach((p) => {
      personDemand[p.id] = 0;
    });
    tasks.forEach((t) => {
      if (personDemand[t.p] !== undefined) {
        personDemand[t.p] = round1(personDemand[t.p] + Number(t.md));
      }
    });

    // Dostupná kapacita po rolích — osoba bez existující role se nezapočítá.
    const roleAvail: Record<string, number> = {};
    Object.keys(roles).forEach((k) => {
      roleAvail[k] = 0;
    });
    people.forEach((p) => {
      if (roleAvail[p.role] !== undefined) {
        roleAvail[p.role] = round1(roleAvail[p.role] + personTotalMD(p));
      }
    });

    // Naplánovaná práce celkem — proti rozpočtu se porovnává tahle, ne `grand`
    // (ta je jen dostupná kapacita). Sdílená funkce s hlavičkou, ať se ta dvě
    // čísla nemůžou rozejít.
    return { grand, planned: plannedMD(tasks), weekTotals, personDemand, roleAvail };
  }, [people, tasks, weeks, roles]);
}

export type CapacityTotals = ReturnType<typeof useCapacityTotals>;
