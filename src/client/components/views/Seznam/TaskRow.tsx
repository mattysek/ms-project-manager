// Jeden řádek tabulky úkolů — sdílený backlogem i sekcemi jednotlivých osob.
// Liší se jen sloupcem Progress (`row.showProgress`), zbytek je totožný.
import type { Categories, Task } from '../../../types';
import { progressColor } from '../../../utils';
import type { TaskRowActions } from './types';

export interface TaskRowConfig {
  task: Task;
  index: number;
  cats: Categories;
  numWeeks: number;
  showProgress: boolean;
  isDragging: boolean;
  dragTitle: string;
}

interface TaskRowDragHandlers {
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
}

interface TaskRowProps {
  row: TaskRowConfig;
  actions: TaskRowActions;
  drag: TaskRowDragHandlers;
}

const cellStyle = (bg: string): React.CSSProperties => ({
  padding: '4px 5px',
  textAlign: 'center',
  background: bg,
  borderBottom: '1px solid #0f1520',
});

/** Sdílené vlastnosti buněk, které závisí jen na řádku, ne na akci. */
interface RowCellProps {
  task: Task;
  bg: string;
  update: (field: keyof Task, value: string) => void;
}

function DragHandleCell({
  bg,
  dragTitle,
  taskId,
  drag,
}: {
  bg: string;
  dragTitle: string;
  taskId: string;
  drag: TaskRowDragHandlers;
}) {
  return (
    <td
      draggable
      onDragStart={(e) => drag.onDragStart(e, taskId)}
      onDragEnd={drag.onDragEnd}
      style={{ ...cellStyle(bg), cursor: 'grab', color: '#475569', fontSize: 12 }}
      title={dragTitle}
    >
      ⋮⋮
    </td>
  );
}

function NameCell({ task, bg, update }: RowCellProps) {
  return (
    <td style={{ padding: '4px 8px', background: bg, borderBottom: '1px solid #0f1520' }}>
      {/* Jméno v popisku je nutné: v tabulce je těchhle polí tolik, kolik je
          úkolů, a jinak by je od sebe nešlo odlišit — stejně jako v Kapacitě. */}
      <input
        className="inp"
        aria-label={`Název úkolu — ${task.name}`}
        value={task.name}
        onChange={(e) => update('name', e.target.value)}
        style={{ width: '100%', minWidth: 160 }}
      />
    </td>
  );
}

function CategoryCell({ task, bg, update, cats }: RowCellProps & { cats: Categories }) {
  const c = cats[task.cat] || { bg: '#111', bd: '#4b5563', tx: '#94a3b8', label: task.cat };
  return (
    <td style={{ padding: '4px 8px', background: bg, borderBottom: '1px solid #0f1520' }}>
      <select
        className="inp"
        value={task.cat}
        onChange={(e) => update('cat', e.target.value)}
        style={{
          width: '100%',
          background: c.bg,
          borderColor: c.bd,
          color: c.tx,
          cursor: 'pointer',
        }}
      >
        {Object.entries(cats).map(([k, v]) => (
          <option key={k} value={k} style={{ background: '#0c1018', color: '#e2e8f0' }}>
            {v.label}
          </option>
        ))}
      </select>
    </td>
  );
}

const WEEK_FIELD_LABEL: Record<'s' | 'e', string> = { s: 'Od týdne', e: 'Do týdne' };

function WeekCell({
  bg,
  task,
  numWeeks,
  field,
  update,
}: {
  bg: string;
  task: Task;
  numWeeks: number;
  field: 's' | 'e';
  update: (field: keyof Task, value: string) => void;
}) {
  return (
    <td style={cellStyle(bg)}>
      <input
        type="number"
        aria-label={`${WEEK_FIELD_LABEL[field]} — ${task.name}`}
        min="1"
        max={numWeeks}
        value={task[field]}
        className="inp"
        onChange={(e) => update(field, e.target.value)}
        style={{ width: 46, textAlign: 'center', color: '#94a3b8' }}
      />
    </td>
  );
}

function MdCell({ task, bg, update }: RowCellProps) {
  return (
    <td style={cellStyle(bg)}>
      <input
        type="number"
        aria-label={`MD — ${task.name}`}
        min="0.5"
        max="50"
        step="0.5"
        value={task.md}
        className="inp"
        onChange={(e) => update('md', e.target.value)}
        style={{ width: 54, textAlign: 'right', color: '#fcd34d', fontWeight: 700 }}
      />
    </td>
  );
}

function ProgressCell({ task, bg, update }: RowCellProps) {
  return (
    <td style={cellStyle(bg)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={task.progress ?? 0}
          onChange={(e) => update('progress', e.target.value)}
          style={{
            width: 50,
            height: 4,
            cursor: 'pointer',
            accentColor: (task.progress ?? 0) === 100 ? '#34d399' : '#fbbf24',
          }}
        />
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            minWidth: 28,
            color: progressColor(task.progress ?? 0),
          }}
        >
          {task.progress ?? 0}%
        </span>
      </div>
    </td>
  );
}

function DetailButtonCell({
  bg,
  hasContent,
  taskId,
  onOpenDetail,
}: {
  bg: string;
  hasContent: boolean;
  taskId: string;
  onOpenDetail: (taskId: string) => void;
}) {
  return (
    <td style={cellStyle(bg)}>
      <button
        type="button"
        onClick={() => onOpenDetail(taskId)}
        style={{
          background: 'none',
          border: `1px solid ${hasContent ? '#6ee7b7' : '#2d3748'}`,
          borderRadius: 5,
          color: hasContent ? '#6ee7b7' : '#475569',
          cursor: 'pointer',
          fontSize: 9,
          padding: '3px 8px',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          margin: '0 auto',
          transition: 'all .15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#4f9cf9';
          e.currentTarget.style.color = '#4f9cf9';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = hasContent ? '#6ee7b7' : '#2d3748';
          e.currentTarget.style.color = hasContent ? '#6ee7b7' : '#475569';
        }}
      >
        {hasContent && <span style={{ color: '#6ee7b7' }}>●</span>}✎ Detail
      </button>
    </td>
  );
}

function DeleteButtonCell({
  bg,
  taskId,
  onDelete,
}: {
  bg: string;
  taskId: string;
  onDelete: (taskId: string) => void;
}) {
  return (
    <td style={cellStyle(bg)}>
      <button
        type="button"
        onClick={() => onDelete(taskId)}
        style={{
          background: 'none',
          border: 'none',
          color: '#334155',
          cursor: 'pointer',
          fontSize: 13,
          padding: '1px 4px',
          borderRadius: 3,
          transition: 'color .15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#334155')}
      >
        ✕
      </button>
    </td>
  );
}

export function TaskRow({ row, actions, drag }: TaskRowProps) {
  const { task, index, cats, numWeeks, showProgress, isDragging, dragTitle } = row;
  const bg = index % 2 === 0 ? '#0c1018' : '#0e1320';
  const hasContent = Boolean(task.desc) || (task.links || []).length > 0;
  const update = (field: keyof Task, value: string) => actions.onUpdateField(task.id, field, value);

  return (
    <tr className="trow" style={{ opacity: isDragging ? 0.5 : 1 }}>
      <DragHandleCell bg={bg} dragTitle={dragTitle} taskId={task.id} drag={drag} />
      <NameCell task={task} bg={bg} update={update} />
      <CategoryCell task={task} bg={bg} update={update} cats={cats} />
      <WeekCell bg={bg} task={task} numWeeks={numWeeks} field="s" update={update} />
      <WeekCell bg={bg} task={task} numWeeks={numWeeks} field="e" update={update} />
      <MdCell task={task} bg={bg} update={update} />
      {showProgress && <ProgressCell task={task} bg={bg} update={update} />}
      <DetailButtonCell
        bg={bg}
        hasContent={hasContent}
        taskId={task.id}
        onOpenDetail={actions.onOpenDetail}
      />
      <DeleteButtonCell bg={bg} taskId={task.id} onDelete={actions.onDelete} />
    </tr>
  );
}
