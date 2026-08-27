// Varianty tabulky úkolů (backlog vs. osoba) — vytažené z `index.tsx`, ať
// zůstane jen kompozice.
import type { Task } from '../../../types';
import type { TaskTableVariant } from './TaskTable';

function averageProgress(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  return Math.round(tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0) / tasks.length);
}

export function backlogVariant(tasks: Task[], isDropTarget: boolean): TaskTableVariant {
  return {
    kind: 'backlog',
    showProgress: false,
    totalColor: '#94a3b8',
    highlightBorder: '#64748b',
    highlightBg: '#1a1a2e',
    isDropTarget,
    emptyLabel: 'Backlog je prázdný · Přetáhněte úkol sem pro odebrání přiřazení',
    dropHintLabel: '↓ Pusťte úkol zde pro přidání do backlogu',
    footerNote: 'Nepřiřazené úkoly',
    total: tasks.reduce((sum, task) => sum + Number(task.md), 0),
  };
}

export function personVariant(
  tasks: Task[],
  color: string,
  isDropTarget: boolean
): TaskTableVariant {
  return {
    kind: 'person',
    showProgress: true,
    totalColor: color,
    highlightBorder: '#4f9cf9',
    highlightBg: '#0d1f38',
    isDropTarget,
    emptyLabel: 'Žádné úkoly',
    dropHintLabel: '↓ Pusťte úkol zde',
    footerNote: 'Celkem',
    total: tasks.reduce((sum, task) => sum + Number(task.md), 0),
    avgProgress: averageProgress(tasks),
  };
}
