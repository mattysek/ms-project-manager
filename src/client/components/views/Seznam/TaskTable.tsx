// Ohraničená tabulka úkolů — sdílená backlogem i sekcemi jednotlivých osob.
// Sloupec Progress a styl prázdného stavu se liší (`variant.kind`); samotné
// cílení drag-and-drop (onDragOver/Leave/Drop) drží obalující sekce, protože
// musí pokrývat i záhlaví nad tabulkou, ne jen tělo.
import type { Categories, Task } from '../../../types';
import type { TaskRowActions } from './types';
import { TaskRow } from './TaskRow';

export interface TaskTableVariant {
  kind: 'backlog' | 'person';
  showProgress: boolean;
  totalColor: string;
  highlightBorder: string;
  highlightBg: string;
  isDropTarget: boolean;
  emptyLabel: string;
  dropHintLabel: string;
  footerNote: string;
  total: number;
  avgProgress?: number;
}

interface TaskTableDrag {
  draggingTaskId: string | null;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
  rowDragTitle: string;
}

interface TaskTableProps {
  tasks: Task[];
  meta: { cats: Categories; numWeeks: number };
  variant: TaskTableVariant;
  drag: TaskTableDrag;
  actions: TaskRowActions;
}

const thStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '5px 10px',
  textAlign: 'center',
  color: '#475569',
  fontWeight: 500,
  fontSize: 10,
  ...extra,
});

/** Prázdný stav se liší backlog vs. osoba — u backlogu reaguje i barvou/pozadím na drop, u osoby jen textem. */
function emptyRowStyle(variant: TaskTableVariant): React.CSSProperties {
  if (variant.kind === 'backlog') {
    return {
      padding: '14px 16px',
      color: variant.isDropTarget ? '#94a3b8' : '#475569',
      fontSize: 10,
      textAlign: 'center',
      fontStyle: 'italic',
      background: variant.isDropTarget ? '#1a1a2e' : 'transparent',
    };
  }
  return {
    padding: '10px 12px',
    color: '#334155',
    fontSize: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  };
}

export function TaskTable({ tasks, meta, variant, drag, actions }: TaskTableProps) {
  const colSpan = variant.showProgress ? 9 : 8;

  return (
    <div
      style={{
        border: variant.isDropTarget ? `2px solid ${variant.highlightBorder}` : '1px solid #1e2533',
        borderRadius: 8,
        overflow: 'hidden',
        background: variant.isDropTarget ? variant.highlightBg : 'transparent',
        transition: 'all .15s',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 650 }}>
          <thead>
            <tr style={{ background: '#161b27', borderBottom: '1px solid #1e2533' }}>
              <th style={thStyle({ width: 28 })}>⋮⋮</th>
              <th style={thStyle({ textAlign: 'left' })}>Úkol ✎</th>
              <th style={thStyle({ textAlign: 'left', width: 140 })}>Kategorie ✎</th>
              <th style={thStyle({ width: 56 })}>W od ✎</th>
              <th style={thStyle({ width: 56 })}>W do ✎</th>
              <th style={thStyle({ color: '#f59e0b', fontWeight: 600, width: 64 })}>MD ✎</th>
              {variant.showProgress && (
                <th style={thStyle({ color: '#34d399', fontWeight: 600, width: 80 })}>Progress</th>
              )}
              <th style={thStyle({ width: 80 })}>Popis / Odkazy</th>
              <th style={{ padding: '5px 10px', width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr>
                <td colSpan={colSpan} style={emptyRowStyle(variant)}>
                  {variant.isDropTarget ? variant.dropHintLabel : variant.emptyLabel}
                </td>
              </tr>
            )}
            {tasks.map((task, i) => (
              <TaskRow
                key={task.id}
                row={{
                  task,
                  index: i,
                  cats: meta.cats,
                  numWeeks: meta.numWeeks,
                  showProgress: variant.showProgress,
                  isDragging: drag.draggingTaskId === task.id,
                  dragTitle: drag.rowDragTitle,
                }}
                actions={actions}
                drag={{ onDragStart: drag.onDragStart, onDragEnd: drag.onDragEnd }}
              />
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid #1e2533', background: '#161b27' }}>
              <td colSpan={5} style={{ padding: '5px 12px', color: '#334155', fontSize: 9 }}>
                {variant.footerNote}
              </td>
              <td
                style={{
                  padding: '5px 12px',
                  textAlign: 'center',
                  fontWeight: 700,
                  color: variant.totalColor,
                }}
              >
                {variant.total.toFixed(1)}
              </td>
              {variant.showProgress && (
                <td
                  style={{
                    padding: '5px 12px',
                    textAlign: 'center',
                    fontSize: 9,
                    color: '#34d399',
                  }}
                >
                  {variant.avgProgress ?? 0}%
                </td>
              )}
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
