// Tažení pruhů v Ganttu — lokální náhled během pohybu, jeden command až na mouseup.
import { useCallback, useState } from 'react';
import type { DragMode, DragPreview, DragState, Task } from '../../../types';
import { CELL_W, NAME_W } from '../../../constants';

// ── Výpočet náhledu tažení (ADR-005: čistá funkce lokální UI interakce) ────────

export function computeResizeLeftPreview(orig: Task, weekPos: number): DragPreview {
  const newS = Math.max(1, Math.min(orig.e, weekPos));
  return { s: newS, e: orig.e, p: orig.p };
}

export function computeResizeRightPreview(
  orig: Task,
  weekPos: number,
  numWeeks: number
): DragPreview {
  const newE = Math.max(orig.s, Math.min(numWeeks, weekPos));
  return { s: orig.s, e: newE, p: orig.p };
}

export function computeMovePreview(
  orig: Task,
  rawStart: number,
  numWeeks: number,
  tgt: string | null
): DragPreview {
  const dur = orig.e - orig.s;
  const nS = Math.max(1, Math.min(numWeeks - dur, rawStart));
  return { s: nS, e: nS + dur, p: tgt || orig.p };
}

/**
 * Řádek (osoba) pod kurzorem — pro přeřazení úkolu tahem mezi lidmi.
 *
 * Ptá se DOMu, ne aritmetiky. Předchozí verze si pozici řádků dopočítávala:
 * začínala na `headerOffset = 70` („skupiny měsíců ~25px + záhlaví týdnů
 * ~45px") a přičítala výšku každého řádku podle vlastní kopie vzorce z
 * `PersonRow`. Obojí byl problém — odhad záhlaví neplatil (řádek týdnů roste
 * o svátky, vlaječky milníků a počty pracovních dnů) a duplikovaný vzorec se
 * musel držet v souladu s layoutem, o kterém nic nevěděl. Výsledek: přeřazení
 * mezi řádky vycházelo jednou ano, jednou ne, podle toho, jak daleko od
 * hranice řádku kurzor zrovna byl.
 *
 * `elementFromPoint` navíc řeší i posun scrollem zadarmo; dřív se započítával
 * jen vodorovný (`scrollLeft`), svislý ne.
 */
export function findRowPersonId(clientX: number, clientY: number): string | null {
  const element = document.elementFromPoint(clientX, clientY);
  const row = element?.closest<HTMLElement>('[data-person-id]');
  return row?.dataset.personId ?? null;
}

interface UseGanttDragArgs {
  tasks: Task[];
  numWeeks: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** ADR-006: Dev nesmí tahat cizí úkol — tažení se pak vůbec nespustí. */
  canDragTask: (task: Task) => boolean;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  /** Zavření tooltipu při začátku tažení — vlastní ho GanttView. */
  onDragStart: () => void;
  /**
   * Puštění bez skutečného posunu, tedy klik — otevírá detail úkolu.
   *
   * Nejde to nechat na `onClick` prohlížeče: tažený pruh má po dobu tahu
   * `pointer-events: none` (jinak by clonil řádek pod kurzorem), takže
   * `mouseup` netrefí tlačítko a `click` se vůbec nevyvolá. Rozhodnutí
   * „klik nebo tažení" proto padá tady, kde je vidět, jestli se něco změnilo.
   */
  onClickWithoutDrag: (taskId: string) => void;
}

export function useGanttDrag({
  tasks,
  numWeeks,
  containerRef,
  canDragTask,
  setTasks,
  onDragStart,
  onClickWithoutDrag,
}: UseGanttDragArgs) {
  const [dragging, setDragging] = useState<DragState | null>(null);
  // Náhled pozice během tahu — commandy jdou na server až v `onMouseUp`
  // (ADR-005), do té doby jen ovlivňují vykreslení taženého pruhu.
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const onMouseDownBar = useCallback(
    (e: React.MouseEvent<Element>, task: Task, mode: DragMode = 'move') => {
      if (!canDragTask(task)) return;
      e.preventDefault();
      e.stopPropagation();
      onDragStart();
      const rect = e.currentTarget.getBoundingClientRect();
      setDragging({ id: task.id, offsetW: Math.floor((e.clientX - rect.left) / CELL_W), mode });
      setDragPreview(null);
    },
    [canDragTask, onDragStart]
  );

  // Jen počítá a ukládá lokální náhled — command na server jde teprve v
  // `onMouseUp` (ADR-005 „command se pošle teprve při mouseup, ne při každém
  // pohybu"); `orig` je proto vždy poslední potvrzená pozice úkolu.
  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const cont = containerRef.current;
      if (!cont) return;
      const cR = cont.getBoundingClientRect();

      const orig = tasks.find((t) => t.id === dragging.id);
      if (!orig) return;

      const relX = e.clientX - cR.left - NAME_W - 2 + cont.scrollLeft;
      const weekPos = Math.floor(relX / CELL_W) + 1;

      if (dragging.mode === 'resize-left') {
        setDragPreview(computeResizeLeftPreview(orig, weekPos));
      } else if (dragging.mode === 'resize-right') {
        setDragPreview(computeResizeRightPreview(orig, weekPos, numWeeks));
      } else {
        const tgt = findRowPersonId(e.clientX, e.clientY);
        setDragPreview(computeMovePreview(orig, weekPos - dragging.offsetW, numWeeks, tgt));
      }
    },
    [dragging, tasks, numWeeks, containerRef]
  );

  // Commituje náhled jako JEDEN command (move_task/update_task podle
  // `reconcileTasks`) — ADR-005.
  //
  // „Nic se nezměnilo" se pozná porovnáním s původním úkolem, ne existencí
  // náhledu: `computeMovePreview` vrátí náhled při každém pohybu myši, takže
  // i chvění o pár pixelů během kliknutí by jinak vypadalo jako tažení a detail
  // by se neotevřel. Rozlišuje se na úrovni týdnů, protože v nich se plánuje.
  const onMouseUp = useCallback(() => {
    if (!dragging) return;

    const orig = tasks.find((t) => t.id === dragging.id);
    const moved =
      dragPreview &&
      orig &&
      (dragPreview.s !== orig.s || dragPreview.e !== orig.e || dragPreview.p !== orig.p);

    if (moved) {
      const { id } = dragging;
      const { s, e, p } = dragPreview;
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, s, e, p } : t)));
    } else {
      onClickWithoutDrag(dragging.id);
    }

    setDragging(null);
    setDragPreview(null);
  }, [dragging, dragPreview, tasks, setTasks, onClickWithoutDrag]);

  return {
    dragging,
    dragPreview,
    onMouseDownBar,
    onMouseMove,
    onMouseUp,
  };
}
