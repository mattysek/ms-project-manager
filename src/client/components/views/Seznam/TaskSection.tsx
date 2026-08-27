// Jedna sekce seznamu — backlog nebo osoba. Obojí má stejný tvar: barevná
// tečka, název, počet úkolů a MD, tlačítko pro přidání a pod tím tabulka.
// Drag & drop cílení drží tahle obalující sekce, ne tabulka — musí pokrývat
// i záhlaví nad ní.
import type { Categories, Task } from '../../../types';
import type { DropZoneHandlers, TaskRowActions } from './types';
import { TaskTable } from './TaskTable';
import type { TaskTableVariant } from './TaskTable';

export interface TaskSectionHeader {
  /** Barva tečky i názvu; backlog má šedou, osoba svoji. */
  color: string;
  title: string;
  /** Podtitulek — role osoby, u backlogu „nepřiřazené úkoly". */
  subtitle: string;
  addLabel: string;
  addStyle: React.CSSProperties;
  onAdd: () => void;
}

interface TaskSectionProps {
  tasks: Task[];
  header: TaskSectionHeader;
  section: {
    meta: { cats: Categories; numWeeks: number };
    variant: TaskTableVariant;
    drop: DropZoneHandlers;
  };
  drag: {
    draggingTaskId: string | null;
    onDragStart: (e: React.DragEvent, taskId: string) => void;
    onDragEnd: () => void;
    rowDragTitle: string;
  };
  actions: TaskRowActions;
}

export function TaskSection({ tasks, header, section, drag, actions }: TaskSectionProps) {
  const total = tasks.reduce((sum, task) => sum + Number(task.md), 0);

  // Čistá drop zóna pro přetažení úkolu. Klávesová alternativa existuje:
  // přiřazení osoby jde změnit v detailu úkolu (TaskDetailModal), takže drag
  // je zkratka, ne jediná cesta (PRD-07, FR-QUAL-06).
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop zóna, ne ovládací prvek
    <div
      style={{ marginBottom: 18 }}
      onDragOver={section.drop.onDragOver}
      onDragLeave={section.drop.onDragLeave}
      onDrop={section.drop.onDrop}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: header.color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 700, color: header.color }}>{header.title}</span>
        <span style={{ fontSize: 10, color: '#475569' }}>{header.subtitle}</span>
        {tasks.length > 0 ? (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
            {tasks.length} úkolů ·{' '}
            <span style={{ color: header.color, fontWeight: 700 }}>{total.toFixed(1)} MD</span>
          </span>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <button className="btn" type="button" onClick={header.onAdd} style={header.addStyle}>
          {header.addLabel}
        </button>
      </div>
      <TaskTable
        tasks={tasks}
        meta={section.meta}
        variant={section.variant}
        drag={drag}
        actions={actions}
      />
    </div>
  );
}
