// Filtrování seznamu úkolů podle kategorie a osoby (tasks.feature).
// Filtr osoby na rozdíl od filtru kategorie skryje i backlog — jde o
// „soustřeď se jen na tuhle osobu", ne o průsečík dvou filtrů.
import { useState } from 'react';
import type { PersonWithWeeks, Task } from '../../../types';

export interface TaskFiltersState {
  filter: string;
  setFilter: (v: string) => void;
  personFilter: string;
  setPersonFilter: (v: string) => void;
  filtered: Task[];
  personFiltered: Task[];
  visiblePeople: PersonWithWeeks[];
  personFilteredTotalMd: number;
}

export function useTaskFilters(tasks: Task[], people: PersonWithWeeks[]): TaskFiltersState {
  const [filter, setFilter] = useState<string>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');

  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.cat === filter);
  const personFiltered =
    personFilter === 'all' ? filtered : filtered.filter((t) => t.p === personFilter);
  const visiblePeople =
    personFilter === 'all' ? people : people.filter((p) => p.id === personFilter);
  const personFilteredTotalMd = personFiltered.reduce((s, t) => s + Number(t.md), 0);

  return {
    filter,
    setFilter,
    personFilter,
    setPersonFilter,
    filtered,
    personFiltered,
    visiblePeople,
    personFilteredTotalMd,
  };
}
