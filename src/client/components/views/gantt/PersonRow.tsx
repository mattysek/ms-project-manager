// Jeden řádek Ganttu = jedna osoba: jmenovka vlevo, podklad týdnů a pruhy úkolů.
import type {
  Categories,
  DragMode,
  DragPreview,
  DragState,
  Milestone,
  PersonWithWeeks,
  Roles,
  TaskWithLane,
  Week,
} from '../../../types';
import { CELL_W, LANE_G, LANE_H, NAME_W } from '../../../constants';
import { personTotalMD } from '../../../utils';
import { GanttBar, type BarColor } from './GanttBar';
import { isMilestoneComplete, milestonesForWeek, weekMilestoneBg } from './milestones';

interface PersonRowProps {
  person: PersonWithWeeks;
  tasks: TaskWithLane[];
  weeks: Week[];
  numWeeks: number;
  milestones: Milestone[];
  roles: Roles;
  cats: Categories;
  /** Týdny (1-based `Week.w`), ve kterých je osoba přetížená. */
  overallocWeeks: Set<number> | undefined;
  /** Táhne se sem právě úkol? Řádek se pak zvýrazní jako cíl. */
  isDropTarget: boolean;
  /** Právě tažený úkol, ať leží v kterémkoli řádku — kvůli náhledu v cílovém. */
  draggedTask: TaskWithLane | null;
  dragging: DragState | null;
  dragPreview: DragPreview | null;
  onMouseDownBar: (e: React.MouseEvent<Element>, task: TaskWithLane, mode: DragMode) => void;
  onClickBar: (task: TaskWithLane) => void;
  onEnterBar: (e: React.MouseEvent<Element>, task: TaskWithLane) => void;
  onLeaveBar: () => void;
}

/** Úkol bez existující kategorie — šedá, ať je vidět, že klíč nesedí. */
const UNKNOWN_CATEGORY: BarColor = { bg: '#1a1a2a', bd: '#4b5563', tx: '#94a3b8' };

/**
 * Barva pruhu vychází z **kategorie** úkolu.
 *
 * Dřív se barvila podle osoby, což byla dvojí informace o tomtéž: každá osoba
 * má vlastní swimlane řádek s vlastní jmenovkou, takže barva navíc neřekla nic
 * nového — a hlavně tím ztratila smysl legenda kategorií pod grafem, protože
 * žádný pruh její barvu nenesl. Kategorie je jediná vlastnost úkolu, kterou
 * z rozvržení Ganttu poznat nejde.
 *
 */
export function barColorFor(task: TaskWithLane, cats: Categories): BarColor {
  return cats[task.cat] ?? UNKNOWN_CATEGORY;
}

/**
 * Náhled taženého pruhu v CÍLOVÉM řádku.
 *
 * Pruhy se kreslí podle `lanes`, tedy podle **uloženého** `task.p` — tažený
 * úkol tak zůstával viset ve zdrojovém řádku, i když se cíl už zvýrazňoval.
 * Uvnitř jednoho řádku zdroj a cíl splývají, takže tam náhled vypadal správně
 * a chyba byla vidět až při přetahování mezi lidmi.
 *
 * Lane se schválně přebírá beze změny: přepočítat ji na volnou v cílovém řádku
 * by mohlo změnit jeho výšku uprostřed tahu, tím posunout řádky pod ním a
 * změnit, co je pod kurzorem.
 */
function ghostFor(
  personId: string,
  draggedTask: TaskWithLane | null,
  dragPreview: DragPreview | null
) {
  if (!draggedTask || !dragPreview) return null;
  if (dragPreview.p !== personId || draggedTask.p === personId) return null;
  return { task: draggedTask, s: dragPreview.s, e: dragPreview.e };
}

/** Přilepená jmenovka vlevo — jméno, varování o přetížení, role, součet MD. */
function PersonNameCell({
  person,
  roles,
  overallocWeeks,
}: {
  person: PersonWithWeeks;
  roles: Roles;
  overallocWeeks: Set<number> | undefined;
}) {
  return (
    <div
      style={{
        width: NAME_W,
        flexShrink: 0,
        paddingRight: 8,
        paddingTop: 6,
        position: 'sticky',
        left: 0,
        background: '#0f1117',
        zIndex: 3,
        boxShadow: '4px 0 8px -2px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: person.color }}>
        {person.name}
        {overallocWeeks && overallocWeeks.size > 0 && (
          <span
            style={{ marginLeft: 4, fontSize: 9, color: '#f87171' }}
            title={`Přetížení v ${overallocWeeks.size} týdnech`}
          >
            ⚠
          </span>
        )}
      </div>
      <div style={{ fontSize: 9, color: '#475569' }}>
        {roles[person.role]?.label || person.role}
      </div>
      <div style={{ fontSize: 8, color: '#334155', marginTop: 1 }}>{personTotalMD(person)} MD</div>
    </div>
  );
}

/** Podklad řádku — mřížka týdnů s podbarvením přetížení a milníků. */
function WeekBackdrop({
  weeks,
  milestones,
  overallocWeeks,
}: {
  weeks: Week[];
  milestones: Milestone[];
  overallocWeeks: Set<number> | undefined;
}) {
  return (
    <>
      {weeks.map((w) => {
        const isOveralloc = overallocWeeks?.has(w.w);
        const wMilestones = milestonesForWeek(milestones, w.w - 1);
        const allComplete =
          wMilestones.length > 0 && wMilestones.every((m) => isMilestoneComplete(m));
        return (
          <div
            key={w.w}
            style={{
              position: 'absolute',
              left: (w.w - 1) * CELL_W,
              top: 0,
              width: CELL_W,
              height: '100%',
              borderRight: '1px solid #131a24',
              background: isOveralloc
                ? '#f8717122'
                : weekMilestoneBg(wMilestones.length > 0, allComplete),
              borderLeft: isOveralloc ? '2px solid #f8717155' : 'none',
              borderTop: isOveralloc ? '2px solid #f8717155' : 'none',
              borderBottom: isOveralloc ? '2px solid #f8717155' : 'none',
              pointerEvents: 'none',
            }}
          />
        );
      })}
    </>
  );
}

export function PersonRow({
  person,
  tasks,
  weeks,
  numWeeks,
  milestones,
  roles,
  cats,
  overallocWeeks,
  isDropTarget,
  draggedTask,
  dragging,
  dragPreview,
  onMouseDownBar,
  onClickBar,
  onEnterBar,
  onLeaveBar,
}: PersonRowProps) {
  const numLanes = tasks.length > 0 ? Math.max(...tasks.map((t) => t.lane + 1)) : 1;
  const rowH = numLanes * (LANE_H + LANE_G) + 14;
  const ghost = ghostFor(person.id, draggedTask, dragPreview);

  return (
    // `data-person-id` je kotva pro `findRowPersonId` — cíl přetažení se hledá
    // přes `elementFromPoint`, ne dopočítáváním výšek (viz `useGanttDrag`).
    <div data-person-id={person.id} style={{ display: 'flex', marginBottom: 5 }}>
      <PersonNameCell person={person} roles={roles} overallocWeeks={overallocWeeks} />
      <div
        // Cíl přetažení je vlastní příznak, ne jen barva pozadí — zvýraznění
        // je to jediné, co uživateli během tahu říká, kam úkol spadne.
        data-drop-target={isDropTarget ? 'true' : undefined}
        style={{
          position: 'relative',
          width: CELL_W * numWeeks,
          height: rowH,
          background: isDropTarget ? '#13203a' : '#0c1018',
          borderRadius: 4,
          border: isDropTarget ? '1px solid #4f9cf944' : '1px solid #1e2533',
          transition: 'all .15s',
        }}
      >
        <WeekBackdrop weeks={weeks} milestones={milestones} overallocWeeks={overallocWeeks} />
        {tasks.map((task) => {
          const isDragging = dragging?.id === task.id;
          // Dokud se tahá, pruh se vizuálně řídí lokálním náhledem
          // (ne `task.s/e` — ty se nezmění, dokud nedorazí mouseup).
          const preview = isDragging ? dragPreview : null;
          return (
            <GanttBar
              key={task.id}
              task={task}
              color={barColorFor(task, cats)}
              isDragging={isDragging}
              dragMode={dragging?.mode ?? null}
              barS={preview?.s ?? task.s}
              barE={preview?.e ?? task.e}
              // Táhne se pryč z tohohle řádku — pruh se kreslí jako duch
              // v cílovém, tady po něm zůstane jen místo (viz `visible`).
              visible={!preview || preview.p === person.id}
              onMouseDownBar={onMouseDownBar}
              onClickBar={onClickBar}
              onEnterBar={onEnterBar}
              onLeaveBar={onLeaveBar}
            />
          );
        })}
        {ghost && (
          <GanttBar
            task={ghost.task}
            color={barColorFor(ghost.task, cats)}
            isDragging
            dragMode={dragging?.mode ?? null}
            barS={ghost.s}
            barE={ghost.e}
            onMouseDownBar={onMouseDownBar}
            onClickBar={onClickBar}
            onEnterBar={onEnterBar}
            onLeaveBar={onLeaveBar}
          />
        )}
      </div>
    </div>
  );
}
