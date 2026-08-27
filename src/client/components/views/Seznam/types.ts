// Sdílené typy pro rozpad SeznamView (ADR-012) — akce nad řádkem úkolu a
// drag & drop rozhraní bundlujeme do objektů, aby podkomponenty neměly propy
// za hranicí rozpočtu (viz `soubory/` — stejný vzor s `actions`).
import type { Task } from '../../../types';

export interface TaskRowActions {
  onUpdateField: (id: string, field: keyof Task, value: string | number) => void;
  onOpenDetail: (id: string) => void;
  onDelete: (id: string) => void;
}

export interface DropZoneHandlers {
  isOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export interface DragDropApi {
  draggingTaskId: string | null;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
  /** `key` odlišuje cílovou zónu (osoba/backlog), `assigneeId` je hodnota zapsaná do `task.p`. */
  dropTarget: (key: string, assigneeId: string) => DropZoneHandlers;
}
