// Vlastní plátno Ganttu — vodorovně scrollovatelná mřížka se záhlavím, řádky a legendou.
import type {
  Categories,
  DragMode,
  DragPreview,
  DragState,
  Milestone,
  MonthGroup,
  PersonWithWeeks,
  Roles,
  TaskWithLane,
  Week,
  WeekWithHolidays,
} from '../../../types';
import { CELL_W, NAME_W } from '../../../constants';
import { CategoryLegend, MonthGroupsRow, WeekHeaderRow } from './ChartHeader';
import { PersonRow } from './PersonRow';

interface ChartCanvasProps {
  /** Scrollovací obal — proti němu se přepočítává pozice kurzoru při tažení. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Kreslicí plocha bez scrollbaru — vstup pro export do PNG. */
  ganttRef: React.RefObject<HTMLDivElement>;
  people: PersonWithWeeks[];
  lanes: Record<string, TaskWithLane[]>;
  weeks: Week[];
  weeksWithHolidays: WeekWithHolidays[];
  monthGroups: MonthGroup[];
  currentWeekIdx: number;
  numWeeks: number;
  milestones: Milestone[];
  roles: Roles;
  cats: Categories;
  overallocation: Map<string, Set<number>>;
  /** Osoba, které patří právě tažený úkol — její řádek se zvýrazní. */
  /**
   * Řádek, na který úkol právě spadne — tedy `dragPreview.p`.
   *
   * Dřív se sem posílal vlastník taženého úkolu, takže se zvýrazňoval **zdroj**
   * a nikdy cíl. Vypadalo to správně jen při posunu uvnitř téhož řádku, kde
   * zdroj a cíl splývají — a přesně tak to i bylo hlášeno.
   */
  dropTargetId: string | undefined;
  /** Právě tažený úkol — cílový řádek z něj kreslí náhled. */
  draggedTask: TaskWithLane | null;
  dragging: DragState | null;
  dragPreview: DragPreview | null;
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUp: () => void;
  onMouseDownBar: (e: React.MouseEvent<Element>, task: TaskWithLane, mode: DragMode) => void;
  onClickBar: (task: TaskWithLane) => void;
  onEnterBar: (e: React.MouseEvent<Element>, task: TaskWithLane) => void;
  onLeaveBar: () => void;
}

export function ChartCanvas({
  containerRef,
  ganttRef,
  people,
  lanes,
  weeks,
  weeksWithHolidays,
  monthGroups,
  currentWeekIdx,
  numWeeks,
  milestones,
  roles,
  cats,
  overallocation,
  dropTargetId,
  draggedTask,
  dragging,
  dragPreview,
  onMouseMove,
  onMouseUp,
  onMouseDownBar,
  onClickBar,
  onEnterBar,
  onLeaveBar,
}: ChartCanvasProps) {
  return (
    // Sleduje aktivní tažení spuštěné na pruhu/úchytu (mousemove/up/leave),
    // sama o sobě nejde „aktivovat". Klávesnicová náhrada za drag přesun/resize
    // je otevření TaskDetailModal z pruhu (viz komentář v GanttBar) a číselná
    // pole Týden od/do.
    // biome-ignore lint/a11y/noStaticElementInteractions: sleduje probíhající tažení, není to samostatně aktivovatelný prvek
    <div
      style={{ overflowX: 'auto', overflowY: 'visible' }}
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        ref={ganttRef}
        style={{
          minWidth: NAME_W + CELL_W * numWeeks + 20,
          background: '#0f1117',
          paddingBottom: 8,
        }}
      >
        <MonthGroupsRow monthGroups={monthGroups} />
        <WeekHeaderRow
          weeks={weeksWithHolidays}
          currentWeekIdx={currentWeekIdx}
          milestones={milestones}
        />
        {people.map((person) => (
          <PersonRow
            key={person.id}
            person={person}
            tasks={lanes[person.id] || []}
            weeks={weeks}
            numWeeks={numWeeks}
            milestones={milestones}
            roles={roles}
            cats={cats}
            overallocWeeks={overallocation.get(person.id)}
            isDropTarget={dropTargetId === person.id}
            draggedTask={draggedTask}
            dragging={dragging}
            dragPreview={dragPreview}
            onMouseDownBar={onMouseDownBar}
            onClickBar={onClickBar}
            onEnterBar={onEnterBar}
            onLeaveBar={onLeaveBar}
          />
        ))}
        <CategoryLegend cats={cats} />
      </div>
    </div>
  );
}
