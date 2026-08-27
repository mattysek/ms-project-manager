// Seznam úkolů (tasks.feature) — po rozpadu podle FR-QUAL-02 tenhle soubor
// jen skládá: filtry, správa kategorií, backlog a sekce jednotlivých osob.
// Počítá se v `use*` hoocích, kreslí v podkomponentách.
import type { Categories, PersonWithWeeks, Roles, Task } from '../../../types';
import { BacklogSection } from './BacklogSection';
import { CategoryManager } from './CategoryManager';
import { PersonSections } from './PersonSections';
import { SeznamDetailModal } from './SeznamDetailModal';
import { TaskFilters } from './TaskFilters';
import { exportTasksToExcel } from './exportTasksToExcel';
import { useSeznamViewModel } from './useSeznamViewModel';
import { useFocusedTask } from './useFocusedTask';

interface SeznamViewProps {
  /**
   * Úkol, jehož detail se má po vykreslení otevřít — proklik z „Moje práce"
   * (PRD-08). Jednorázový: `onFocusHandled` ho zase zahodí, aby se detail
   * neotvíral znovu po každém zavření.
   */
  focusTaskId?: string | null;
  onFocusHandled?: () => void;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  people: PersonWithWeeks[];
  cats: Categories;
  setCats: React.Dispatch<React.SetStateAction<Categories>>;
  roles: Roles;
  numWeeks: number;
}

export function SeznamView(props: SeznamViewProps) {
  const { tasks, setTasks, people, cats, setCats, roles, numWeeks } = props;
  const vm = useSeznamViewModel({ tasks, setTasks, people, cats, setCats, numWeeks });
  useFocusedTask(props.focusTaskId, props.onFocusHandled, tasks, vm.editor.openDetail);

  return (
    <div style={{ padding: '20px 28px', fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>
      <CategoryManager cats={cats} tasks={tasks} catMgr={vm.catMgr} />

      <TaskFilters
        cats={cats}
        people={people}
        filters={vm.filters}
        summary={{
          count: vm.filters.personFiltered.length,
          totalMd: vm.filters.personFilteredTotalMd,
          onExport: () =>
            exportTasksToExcel(vm.filters.personFiltered, people, cats, vm.filters.filter),
        }}
      />

      <BacklogSection vm={vm} />
      <PersonSections vm={vm} roles={roles} />
      <SeznamDetailModal
        vm={vm}
        cats={cats}
        people={people}
        numWeeks={numWeeks}
        setTasks={setTasks}
      />
    </div>
  );
}
