import type { Roles } from '../../../types';
import { TaskSection } from './TaskSection';
import { personVariant } from './taskVariants';
import { ADD_TASK_STYLE, DRAG_TITLE } from './useSeznamViewModel';
import type { SeznamViewModel } from './useSeznamViewModel';

export function PersonSections({ vm, roles }: { vm: SeznamViewModel; roles: Roles }) {
  return (
    <>
      {vm.filters.visiblePeople.map((person) => {
        const personTasks = vm.filters.filtered.filter((task) => task.p === person.id);
        const drop = vm.drag.dropTarget(person.id, person.id);

        return (
          <TaskSection
            key={person.id}
            tasks={personTasks}
            header={{
              color: person.color,
              title: person.name,
              subtitle: roles[person.role]?.label || person.role,
              addLabel: '+ Přidat úkol',
              addStyle: ADD_TASK_STYLE,
              onAdd: () => vm.taskActions.addTask(person.id),
            }}
            section={{
              meta: vm.meta,
              variant: personVariant(personTasks, person.color, drop.isOver),
              drop,
            }}
            drag={{ ...vm.drag, rowDragTitle: DRAG_TITLE }}
            actions={vm.rowActions}
          />
        );
      })}
    </>
  );
}
