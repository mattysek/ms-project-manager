// Jeden pruh úkolu v Ganttu — tažení myší, klávesnicí otevírá TaskDetailModal.
import type { Category, DragMode, TaskWithLane } from '../../../types';
import { CELL_W, LANE_G, LANE_H } from '../../../constants';

export type BarColor = Pick<Category, 'bg' | 'bd' | 'tx'>;

interface GanttBarProps {
  task: TaskWithLane;
  color: BarColor;
  /** Táhne se právě tento pruh? Pak se řídí náhledem, ne `task.s/e`. */
  isDragging: boolean;
  /** Aktivní režim tažení — jen pro zvýraznění úchytu, který se drží. */
  dragMode: DragMode | null;
  /** Zobrazený rozsah — během tažení náhled, jinak `task.s`/`task.e`. */
  barS: number;
  barE: number;
  /**
   * `false` skryje pruh, ale nechá ho v layoutu.
   *
   * Používá se při tažení do jiného řádku: pruh se vykresluje jako duch
   * v cílovém řádku, ale v tom původním musí zůstat místo — kdyby odtud
   * zmizel úplně, řádek by se zmenšil, všechno pod ním by se posunulo a cíl
   * pod kurzorem by se přepočítal jinam. Tah by se rozkmital.
   */
  visible?: boolean;
  onMouseDownBar: (e: React.MouseEvent<Element>, task: TaskWithLane, mode: DragMode) => void;
  onClickBar: (task: TaskWithLane) => void;
  onEnterBar: (e: React.MouseEvent<Element>, task: TaskWithLane) => void;
  onLeaveBar: () => void;
}

/**
 * 8px úchyt pro myší resize, bez vlastního klávesnicového ekvivalentu;
 * klávesnice mění s/e přes číselná pole v TaskDetailModal (otevře se Enterem
 * na pruhu, viz komentář u tlačítka pruhu níže).
 */
function ResizeHandle({
  side,
  active,
  color,
  onMouseDown,
}: {
  side: 'left' | 'right';
  active: boolean;
  color: string;
  onMouseDown: (e: React.MouseEvent<Element>) => void;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: čistě myší resize úchyt, klávesnicová náhrada je v TaskDetailModal
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown(e);
      }}
      style={{
        position: 'absolute',
        [side]: 0,
        top: 0,
        width: 8,
        height: '100%',
        cursor: 'ew-resize',
        background: active ? `${color}88` : 'transparent',
        borderRadius: side === 'left' ? '4px 0 0 4px' : '0 4px 4px 0',
      }}
    />
  );
}

/** Výplň hotové části pruhu + ryska na aktuálním procentu. */
function ProgressOverlay({ progress }: { progress: number }) {
  if (progress <= 0) return null;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${progress}%`,
          background: progress === 100 ? '#34d39933' : '#fbbf2433',
          borderRadius: '3px 0 0 3px',
          pointerEvents: 'none',
        }}
      />
      {progress < 100 && (
        <div
          style={{
            position: 'absolute',
            left: `${progress}%`,
            bottom: 0,
            width: 2,
            height: 4,
            background: '#fbbf24',
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
}

type BarGeometry = Pick<
  GanttBarProps,
  'task' | 'color' | 'isDragging' | 'barS' | 'barE' | 'visible'
>;

function barStyle({
  task,
  color,
  isDragging,
  barS,
  barE,
  visible,
}: BarGeometry): React.CSSProperties {
  return {
    position: 'absolute',
    left: (barS - 1) * CELL_W + 2,
    width: (barE - barS + 1) * CELL_W - 4,
    top: task.lane * (LANE_H + LANE_G) + 5,
    height: LANE_H,
    background: isDragging ? `${color.bd}55` : color.bg,
    border: `1px solid ${color.bd}`,
    borderRadius: 4,
    color: color.tx,
    font: 'inherit',
    fontSize: 9,
    textAlign: 'left',
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 20 : 1,
    // Tažený pruh se veze pod kurzorem, takže by `elementFromPoint` vracel jeho
    // a ne řádek pod ním — cíl přetažení by pak zůstal navždy zdrojový řádek.
    pointerEvents: isDragging ? ('none' as const) : ('auto' as const),
    boxShadow: isDragging ? `0 4px 20px ${color.bd}44` : 'none',
    transform: isDragging ? 'scale(1.01)' : 'scale(1)',
    transition: isDragging ? 'none' : 'box-shadow .15s,transform .15s',
    visibility: visible === false ? ('hidden' as const) : ('visible' as const),
  };
}

export function GanttBar({
  task,
  color,
  isDragging,
  dragMode,
  barS,
  barE,
  visible,
  onMouseDownBar,
  onClickBar,
  onEnterBar,
  onLeaveBar,
}: GanttBarProps) {
  const progress = task.progress ?? 0;

  return (
    // Pruh je <button> — myší lze tahat (onMouseDown), klávesnicí otevře
    // TaskDetailModal (Enter/mezerník aktivuje nativně) s číselnými poli
    // „Týden od/do", což je plná klávesnicová náhrada za drag přesun/resize.
    <button
      type="button"
      onMouseDown={(e) => onMouseDownBar(e, task, 'move')}
      // `detail === 0` znamená aktivaci z klávesnice. Myší klik se sem
      // nedostane (tažený pruh nemá pointer events, takže `click` nevznikne)
      // a kdyby přece, řešil by ho `onMouseUp` podruhé.
      onClick={(e) => {
        if (e.detail === 0) onClickBar(task);
      }}
      onMouseEnter={(e) => onEnterBar(e, task)}
      onMouseLeave={onLeaveBar}
      style={barStyle({ task, color, isDragging, barS, barE, visible })}
    >
      <ResizeHandle
        side="left"
        active={isDragging && dragMode === 'resize-left'}
        color={color.bd}
        onMouseDown={(e) => onMouseDownBar(e, task, 'resize-left')}
      />
      <ResizeHandle
        side="right"
        active={isDragging && dragMode === 'resize-right'}
        color={color.bd}
        onMouseDown={(e) => onMouseDownBar(e, task, 'resize-right')}
      />
      <ProgressOverlay progress={progress} />
      {progress === 100 && (
        <span style={{ flexShrink: 0, fontSize: 10, pointerEvents: 'none', color: '#34d399' }}>
          ✓
        </span>
      )}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          pointerEvents: 'none',
          position: 'relative',
        }}
      >
        {task.name}
      </span>
      <span
        style={{
          flexShrink: 0,
          opacity: 0.5,
          fontSize: 8,
          pointerEvents: 'none',
          position: 'relative',
        }}
      >
        {task.md}MD
      </span>
    </button>
  );
}
