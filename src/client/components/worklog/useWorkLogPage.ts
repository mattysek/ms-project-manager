// Stav obrazovky výkazů — vytaženo z `WorkLogPage`, ať zůstane pod rozpočtem
// ADR-012 (60 řádků na funkci).
import { useCallback, useMemo, useState } from 'react';
import type { WorkLogEntry } from '../../api/worklogApi';
import { useWorkLog } from '../../hooks/useWorkLog';
import { useWorkTimer } from '../../hooks/useWorkTimer';
import { EMPTY_FILTER, filterEntries, type WorkLogFilter } from '../../utils/worklog';
import { useProjectOptions } from './useProjectOptions';
import { makePeriod, type Period } from './period';

export type WorkLogTab = 'entries' | 'summary';

export function useWorkLogPage() {
  const [period, setPeriod] = useState<Period>(() => makePeriod('month', new Date()));
  const [filter, setFilter] = useState<WorkLogFilter>(EMPTY_FILTER);
  const [tab, setTab] = useState<WorkLogTab>('entries');
  const [editing, setEditing] = useState<WorkLogEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const data = useWorkLog(period);
  const { projects, projectNames } = useProjectOptions();

  // Stopky a seznam musí zůstat v souladu: start i stop mění i to, co je
  // ve výpisu, takže po každém zápisu následuje přenačtení.
  const reload = useCallback(() => {
    void data.reload();
  }, [data.reload]);
  const timer = useWorkTimer(reload);

  const visible = useMemo(() => filterEntries(data.entries, filter), [data.entries, filter]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (entry: WorkLogEntry) => {
    setEditing(entry);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const remove = (entry: WorkLogEntry) => {
    if (confirm(`Smazat záznam „${entry.title}"?`)) {
      void data.remove(entry.id);
      // Smazání běžícího záznamu zastaví stopky (FR-WL-06) — panel i tlačítko
      // se to jinak nedozví, protože běžící činnost drží `useWorkTimer`.
      void timer.refresh();
    }
  };

  return {
    period,
    setPeriod,
    filter,
    setFilter,
    tab,
    setTab,
    data,
    timer,
    projects,
    projectNames,
    visible,
    editing,
    formOpen,
    openNew,
    openEdit,
    closeForm,
    remove,
  };
}
