import { useCallback, useRef, useState, useMemo } from 'react';
import html2canvas from 'html2canvas';
import type {
  PersonWithWeeks,
  Task,
  TaskWithLane,
  Week,
  MonthGroup,
  Categories,
  Roles,
  Milestone,
} from '../../types';
import type { MemberRole } from '../../types/protocol';
import { computeWeeksWithHolidays } from '../../utils';
import { ChartCanvas } from './gantt/ChartCanvas';
import { GanttOverlays } from './gantt/GanttOverlays';
import { useGanttDrag } from './gantt/useGanttDrag';
import { useGanttTooltip } from './gantt/useGanttTooltip';
import { useOverallocation } from './gantt/useOverallocation';
import { LAYERS } from '../../constants/layers';

interface GanttViewProps {
  people: PersonWithWeeks[];
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  weeks: Week[];
  monthGroups: MonthGroup[];
  cats: Categories;
  roles: Roles;
  lanes: Record<string, TaskWithLane[]>;
  numWeeks: number;
  milestones: Milestone[];
  /** Role přihlášeného uživatele — Dev smí tahat jen vlastní úkol (ADR-006). `null` = zatím nenačteno, chová se restriktivně jako Dev bez vlastního úkolu. */
  role: MemberRole | null;
  /** Id přihlášeného uživatele — porovnává se s `Person.userId` majitele úkolu (ADR-006 doplněk). */
  currentUserId: string | null;
}

function EmptyState() {
  return (
    <div style={{ padding: '20px 28px' }}>
      <div style={{ color: '#475569', padding: 20 }}>
        Nastav platné datum projektu v záložce Projekt.
      </div>
    </div>
  );
}

function ExportButton({ exporting, onExport }: { exporting: boolean; onExport: () => void }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: LAYERS.stickyHeader,
        background: '#0f1117',
        paddingBottom: 12,
      }}
    >
      <button
        type="button"
        className="btn"
        onClick={onExport}
        disabled={exporting}
        style={{
          background: exporting ? '#0c1a2e' : '#0d1f38',
          borderColor: '#3b82f644',
          color: exporting ? '#475569' : '#93c5fd',
        }}
      >
        {exporting ? '⏳' : '⬇'} PNG
      </button>
    </div>
  );
}

/**
 * Dev smí tahat jen úkol přiřazený osobě, jejíž `userId` odpovídá přihlášenému
 * uživateli (ADR-006 doplněk); jen PM má neomezený přístup — dokud role není
 * známá (`null`), chováme se restriktivně jako Dev.
 */
function useCanDragTask(
  role: MemberRole | null,
  people: PersonWithWeeks[],
  currentUserId: string | null
) {
  return useCallback(
    (task: Task): boolean => {
      if (role === 'pm') return true;
      const owner = people.find((p) => p.id === task.p);
      return !!owner?.userId && owner.userId === currentUserId;
    },
    [role, people, currentUserId]
  );
}

/** Stažení aktuálního plátna jako `harmonogram.png`. */
function useExportPNG(ganttRef: React.RefObject<HTMLDivElement>) {
  const [exporting, setExporting] = useState(false);
  const exportPNG = useCallback(async () => {
    if (!ganttRef.current) return;
    setExporting(true);
    try {
      const c = await html2canvas(ganttRef.current, {
        backgroundColor: '#0f1117',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const a = document.createElement('a');
      a.download = 'harmonogram.png';
      a.href = c.toDataURL('image/png');
      a.click();
    } finally {
      setExporting(false);
    }
  }, [ganttRef]);
  return { exporting, exportPNG };
}

/** Sesbírá stav Ganttu (tažení, tooltip, otevřený detail) do jednoho celku. */
function useGanttInteraction(props: GanttViewProps) {
  const { people, tasks, setTasks, numWeeks, role, currentUserId } = props;
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<HTMLDivElement>(null);

  const { tooltip, closeTooltip, showTooltipAfterDelay } = useGanttTooltip();
  const canDragTask = useCanDragTask(role, people, currentUserId);

  const openDetail = useCallback(
    (taskId: string) => {
      closeTooltip();
      setEditingTaskId(taskId);
    },
    [closeTooltip]
  );

  const drag = useGanttDrag({
    tasks,
    numWeeks,
    containerRef,
    canDragTask,
    setTasks,
    onDragStart: closeTooltip,
    onClickWithoutDrag: openDetail,
  });

  // Myší klik řeší `onClickWithoutDrag` v `useGanttDrag`; sem doteče jen
  // aktivace z klávesnice (Enter/mezerník), kterou pruh jako `<button>` umí
  // a která je zároveň klávesová náhrada za tažení (viz `GanttBar`).
  const onClickBar = useCallback((task: Task) => openDetail(task.id), [openDetail]);

  // Během tažení se tooltip nesmí objevit — hover handler se proto zahodí.
  const onEnterBar = drag.dragging ? closeTooltip : showTooltipAfterDelay;

  return {
    containerRef,
    ganttRef,
    drag,
    tooltip,
    closeTooltip,
    onClickBar,
    onEnterBar,
    // Tažený úkol se hledá v `lanes`, ne v `tasks` — cílový řádek potřebuje
    // i jeho `lane`, aby náhled sedl svisle tam, kde pruh doopravdy je.
    draggedTask: drag.dragging
      ? (Object.values(props.lanes)
          .flat()
          .find((task) => task.id === drag.dragging?.id) ?? null)
      : null,
    editingTask: editingTaskId ? tasks.find((t) => t.id === editingTaskId) : null,
    closeDetail: useCallback(() => setEditingTaskId(null), []),
  };
}

export function GanttView(props: GanttViewProps) {
  const { people, tasks, setTasks, weeks, monthGroups, cats, roles, lanes, numWeeks, milestones } =
    props;
  const ui = useGanttInteraction(props);
  const { exporting, exportPNG } = useExportPNG(ui.ganttRef);
  const overallocation = useOverallocation(people, tasks, weeks);

  // Find current week index (0-based) based on today's date
  const currentWeekIdx = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return weeks.findIndex((w) => w.mondayISO <= today && today <= w.fridayISO);
  }, [weeks]);

  // České státní svátky pro záhlaví týdnů (ADR-005: klientský výpočet nad kalendářem).
  const weeksWithHolidays = useMemo(() => computeWeeksWithHolidays(weeks), [weeks]);

  if (numWeeks === 0) return <EmptyState />;

  const { drag } = ui;
  return (
    <div style={{ padding: '20px 28px', cursor: drag.dragging ? 'grabbing' : 'default' }}>
      <ExportButton exporting={exporting} onExport={exportPNG} />
      <ChartCanvas
        containerRef={ui.containerRef}
        ganttRef={ui.ganttRef}
        people={people}
        lanes={lanes}
        weeks={weeks}
        weeksWithHolidays={weeksWithHolidays}
        monthGroups={monthGroups}
        currentWeekIdx={currentWeekIdx}
        numWeeks={numWeeks}
        milestones={milestones}
        roles={roles}
        cats={cats}
        overallocation={overallocation}
        dropTargetId={drag.dragPreview?.p}
        draggedTask={ui.draggedTask}
        dragging={drag.dragging}
        dragPreview={drag.dragPreview}
        onMouseMove={drag.onMouseMove}
        onMouseUp={drag.onMouseUp}
        onMouseDownBar={drag.onMouseDownBar}
        onClickBar={ui.onClickBar}
        onEnterBar={ui.onEnterBar}
        onLeaveBar={ui.closeTooltip}
      />
      <GanttOverlays
        tooltip={ui.tooltip}
        editingTask={ui.editingTask}
        cats={cats}
        people={people}
        numWeeks={numWeeks}
        setTasks={setTasks}
        onCloseDetail={ui.closeDetail}
      />
    </div>
  );
}
