// Převod „starý seznam → nový seznam" na sekvenci ProjectCommand.
//
// View komponenty (GanttView, SeznamView, RizikaView, …) zůstávají beze změny —
// dál volají `setTasks(prev => ...)` v tvaru `React.Dispatch<SetStateAction<T[]>>`
// (ADR-005: „Views zůstávají prezentační komponenty na props"). App.tsx ale tyhle
// volání už nesmí mutovat lokální stav přímo — musí z nich odvodit typované
// commandy (ADR-004). `reconcileList` porovná pole podle `id` a vrátí minimální
// sadu add/update/delete commandů, které z `prev` udělají `next`.
//
// Pro `tasks`/`people` existují v protokolu jemnější commandy pro časté případy
// (`move_task`, `update_progress`, `update_alloc`) — ty se generickým diffem
// nedají odvodit obecně (protokol je nezná jako pole), proto mají vlastní
// specializované reconcilery níž, postavené na stejném honoring vzoru.
import type { ProjectCommand } from '../types/protocol';
import type { Person, Task } from '../types';

function valuesDiffer(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** Pole klíčů, jejichž hodnota se mezi `prev` a `next` liší. */
function diffFields<T extends object>(prev: T, next: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (valuesDiffer(prev[key], next[key])) result[key] = next[key];
  }
  return result;
}

export interface ListCommandFactory<T extends { id: string }> {
  add: (item: T) => ProjectCommand;
  update: (id: string, fields: Partial<T>) => ProjectCommand;
  remove: (id: string) => ProjectCommand;
}

/** Obecný reconciler pro entity bez specializovaných dílčích commandů (risks, opps, KB, …). */
export function reconcileList<T extends { id: string }>(
  prev: T[],
  next: T[],
  factory: ListCommandFactory<T>
): ProjectCommand[] {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));
  const commands: ProjectCommand[] = [];

  for (const item of next) {
    const before = prevById.get(item.id);
    if (!before) {
      commands.push(factory.add(item));
      continue;
    }
    const fields = diffFields(before, item);
    if (Object.keys(fields).length > 0) commands.push(factory.update(item.id, fields));
  }
  for (const item of prev) {
    if (!nextIds.has(item.id)) commands.push(factory.remove(item.id));
  }
  return commands;
}

// ── Tasks: move_task / update_progress mají v protokolu vlastní command ────────

function taskFieldCommands(prev: Task, next: Task): ProjectCommand[] {
  const fields = diffFields(prev, next);
  const keys = Object.keys(fields);
  if (keys.length === 0) return [];
  if (keys.every((k) => k === 's' || k === 'e')) {
    return [{ type: 'move_task', taskId: next.id, s: next.s, e: next.e }];
  }
  if (keys.length === 1 && keys[0] === 'progress') {
    return [{ type: 'update_progress', taskId: next.id, progress: next.progress }];
  }
  return [{ type: 'update_task', taskId: next.id, fields }];
}

export function reconcileTasks(prev: Task[], next: Task[]): ProjectCommand[] {
  const prevById = new Map(prev.map((t) => [t.id, t]));
  const nextIds = new Set(next.map((t) => t.id));
  const commands: ProjectCommand[] = [];

  for (const task of next) {
    const before = prevById.get(task.id);
    commands.push(
      ...(before ? taskFieldCommands(before, task) : [{ type: 'add_task', task } as ProjectCommand])
    );
  }
  for (const task of prev) {
    if (!nextIds.has(task.id)) commands.push({ type: 'delete_task', taskId: task.id });
  }
  return commands;
}

// ── People: update_alloc pro změnu jediné buňky alokace ────────────────────────

function singleChangedAllocIndex(prev: number[], next: number[]): number | null {
  const diffIdx: number[] = [];
  for (let i = 0; i < next.length; i++) {
    if (prev[i] !== next[i]) diffIdx.push(i);
  }
  return diffIdx.length === 1 ? diffIdx[0] : null;
}

function personFieldCommands(prev: Person, next: Person): ProjectCommand[] {
  const fields = diffFields(prev, next);
  const keys = Object.keys(fields);
  if (keys.length === 0) return [];
  if (keys.length === 1 && keys[0] === 'weekAlloc') {
    const idx = singleChangedAllocIndex(prev.weekAlloc, next.weekAlloc);
    if (idx !== null) {
      return [{ type: 'update_alloc', personId: next.id, weekIdx: idx, pct: next.weekAlloc[idx] }];
    }
  }
  return [{ type: 'update_person', personId: next.id, fields }];
}

export function reconcilePeople(prev: Person[], next: Person[]): ProjectCommand[] {
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const nextIds = new Set(next.map((p) => p.id));
  const commands: ProjectCommand[] = [];

  for (const person of next) {
    const before = prevById.get(person.id);
    commands.push(
      ...(before
        ? personFieldCommands(before, person)
        : [{ type: 'add_person', person } as ProjectCommand])
    );
  }
  for (const person of prev) {
    if (!nextIds.has(person.id)) commands.push({ type: 'delete_person', personId: person.id });
  }
  return commands;
}
