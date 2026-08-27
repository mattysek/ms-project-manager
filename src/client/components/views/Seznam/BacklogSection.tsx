// Backlog se skrývá při filtru na konkrétní osobu — nemá osobu.
import { TaskSection } from './TaskSection';
import { backlogVariant } from './taskVariants';
import { DRAG_TITLE } from './useSeznamViewModel';
import type { SeznamViewModel } from './useSeznamViewModel';

export function BacklogSection({ vm }: { vm: SeznamViewModel }) {
  if (vm.filters.personFilter !== 'all') return null;

  return (
    <TaskSection
      tasks={vm.backlogTasks}
      header={vm.backlogHeader}
      section={{
        meta: vm.meta,
        variant: backlogVariant(vm.backlogTasks, vm.backlogDrop.isOver),
        drop: vm.backlogDrop,
      }}
      drag={{ ...vm.drag, rowDragTitle: DRAG_TITLE }}
      actions={vm.rowActions}
    />
  );
}
