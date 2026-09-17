// Inverze ProjectCommand pro klientský per-session undo/redo (ADR-007).
//
// V multi-user prostředí odvolává undo pouze commandy vlastního uživatele —
// server o "undo" konceptu nic neví, dostane obyčejný reverzní command stejnou
// cestou jako každou jinou změnu (actor → validace → diff broadcast). Proto je
// `invertCommand` čistá funkce nezávislá na síti i na komponentách: dostane
// command tak, jak byl odeslán, a stav TĚSNĚ PŘED jeho aplikací (`prevState`),
// ze kterého vezme hodnoty potřebné pro návrat (předchozí pozice úkolu,
// předchozí progress, smazanou entitu jako celek…).
//
// `useUndoRedo` musí `prevState` zachytit v okamžiku odeslání commandu (než ho
// aplikuje) a uložit ho spolu s commandem do per-session historie — samotný
// command tuto informaci nenese (viz ADR-007, sekce "Implementační poznámky":
// "delete_task vyžaduje uložení celého snapshotu smazaného úkolu").
//
// ADR-007 tabuluje inverze pro "klíčové" commandy (add/delete/move task,
// update_progress, update_alloc, add/update risk). Tady je stejný vzor
// (add↔delete, update→update s předchozími hodnotami) rozšířený na všechny
// CRUD trojice v protokolu (people, opportunities, KB stránky, todo,
// reminders) — jinak by Ctrl+Z fungoval jen pro zlomek akcí, což by byla
// citelná regrese oproti současnému undo nad celým snapshotem stavu.
//
// `undo`/`redo` jsou session commandy, invertovat je nedává smysl — vrací `null`.
//
// ADR-004 doplněk přidal několik commandů, které do stejného vzoru nezapadají:
//  - `update_presence` je čistě session/UI stav (view, na kterém uživatel je),
//    žádná doménová data nemění — stejně jako `undo`/`redo` vrací `null`.
//  - `full_state_import` nahrazuje CELÝ stav (import projektu) — jeho inverze
//    je symetrická: `full_state_import` s `prevState` jako novým stavem.
//  - `ado_save_pat`/`ado_delete_pat` nelze invertovat, protože server PAT
//    hodnotu klientovi nikdy nevrací (ADR-008, PRD-06 FR-ADO-02) — klient by
//    musel znát předchozí PAT, aby ho mohl obnovit, a tu znalost nemá.
//  - `ado_test_connection`/`ado_run_sync` jsou akční commandy bez přímé
//    doménové mutace na klientovi (výsledek přijde jako diff) — invertovat
//    "spuštění syncu" nedává smysl.
//  - ostatní ADO akční commandy (`ado_push_*`, `ado_accept_from_ado`,
//    `ado_create_work_item`, `ado_*_gap*`, `ado_acknowledge_change`,
//    `ado_ignore_*`) mění stav VNĚ aplikace — v Azure DevOps, případně
//    v serverovém snapshotu rozhodnutí. Ctrl+Z by musel vzít zpět cizí systém,
//    což nejde; případnou mutaci úkolu vrátí undo nad odpovídajícím
//    `task_updated`, ne nad ADO commandem.
import type { ProjectCommand } from '../types/protocol';
import type { AppState } from './appState';
import type { Opportunity, Person, Project, Risk, Task } from '../types';

type CmdType = ProjectCommand['type'];

function isOneOfType<T extends CmdType>(
  command: ProjectCommand,
  types: readonly T[]
): command is Extract<ProjectCommand, { type: T }> {
  return (types as readonly string[]).includes(command.type);
}

function findById<T extends { id: string }>(list: T[], id: string): T | undefined {
  return list.find((item) => item.id === id);
}

/** Vybere z předchozí entity jen ta pole, která command měnil — pro inverzi `update_*`. */
function pickPrevFields<T extends object>(prev: T, fields: Partial<T>): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(fields) as (keyof T)[]) {
    result[key] = prev[key];
  }
  return result;
}

const TASK_TYPES = [
  'add_task',
  'update_task',
  'move_task',
  'update_progress',
  'delete_task',
] as const;
const PERSON_TYPES = ['add_person', 'update_person', 'delete_person', 'update_alloc'] as const;
const PROJECT_META_TYPES = ['update_project', 'set_milestones'] as const;
const RISK_TYPES = ['add_risk', 'update_risk', 'delete_risk'] as const;
const OPPORTUNITY_TYPES = ['add_opportunity', 'update_opportunity', 'delete_opportunity'] as const;
const CONFIG_TYPES = ['set_cats', 'set_roles'] as const;
const KB_TYPES = ['add_kb_page', 'update_kb_page', 'delete_kb_page'] as const;
const TODO_TYPES = ['add_todo', 'update_todo', 'delete_todo'] as const;
const REMINDER_TYPES = ['add_reminder', 'update_reminder', 'delete_reminder'] as const;
/** Session/akční commandy bez smysluplné inverze — viz komentář v hlavičce souboru. */
const NON_INVERTIBLE_TYPES = [
  'undo',
  'redo',
  'update_presence',
  'ado_save_pat',
  'ado_delete_pat',
  'ado_request_status',
  'ado_test_connection',
  'ado_run_sync',
  'ado_acknowledge_change',
  'ado_ignore_gap',
  'ado_ignore_unlinked_task',
  'ado_accept_from_ado',
  'ado_push_assignee',
  'ado_push_state',
  'ado_push_description',
  'ado_create_work_item',
  'ado_add_gap_to_plan',
  'ado_link_gap_to_task',
] as const;

// ── Tasks (ADR-007 tabulka: add/delete/move/update_progress) ──────────────

function invertTaskCommand(
  command: Extract<ProjectCommand, { type: (typeof TASK_TYPES)[number] }>,
  prevState: AppState
): ProjectCommand | null {
  switch (command.type) {
    case 'add_task':
      return { type: 'delete_task', taskId: command.task.id };
    case 'delete_task': {
      const prevTask = findById(prevState.tasks, command.taskId);
      return prevTask ? { type: 'add_task', task: prevTask } : null;
    }
    case 'move_task': {
      const prevTask = findById(prevState.tasks, command.taskId);
      return prevTask
        ? { type: 'move_task', taskId: command.taskId, s: prevTask.s, e: prevTask.e }
        : null;
    }
    case 'update_progress': {
      const prevTask = findById(prevState.tasks, command.taskId);
      return prevTask
        ? { type: 'update_progress', taskId: command.taskId, progress: prevTask.progress }
        : null;
    }
    case 'update_task': {
      const prevTask = findById(prevState.tasks, command.taskId);
      return prevTask
        ? {
            type: 'update_task',
            taskId: command.taskId,
            fields: pickPrevFields<Task>(prevTask, command.fields),
          }
        : null;
    }
  }
}

// ── People (ADR-007 tabulka: update_alloc) ─────────────────────────────────

function invertPersonCommand(
  command: Extract<ProjectCommand, { type: (typeof PERSON_TYPES)[number] }>,
  prevState: AppState
): ProjectCommand | null {
  switch (command.type) {
    case 'add_person':
      return { type: 'delete_person', personId: command.person.id };
    case 'delete_person': {
      const prevPerson = findById(prevState.people, command.personId);
      return prevPerson ? { type: 'add_person', person: prevPerson } : null;
    }
    case 'update_person': {
      const prevPerson = findById(prevState.people, command.personId);
      return prevPerson
        ? {
            type: 'update_person',
            personId: command.personId,
            fields: pickPrevFields<Person>(prevPerson, command.fields),
          }
        : null;
    }
    case 'update_alloc': {
      const prevPerson = findById(prevState.people, command.personId);
      const prevPct = prevPerson?.weekAlloc[command.weekIdx] ?? 0;
      return prevPerson
        ? {
            type: 'update_alloc',
            personId: command.personId,
            weekIdx: command.weekIdx,
            pct: prevPct,
          }
        : null;
    }
  }
}

// ── Metadata projektu (update_project, set_milestones) ─────────────────────

function invertProjectMetaCommand(
  command: Extract<ProjectCommand, { type: (typeof PROJECT_META_TYPES)[number] }>,
  prevState: AppState
): ProjectCommand | null {
  if (command.type === 'update_project') {
    return {
      type: 'update_project',
      fields: pickPrevFields<Project>(prevState.project, command.fields),
    };
  }
  return { type: 'set_milestones', milestones: prevState.project.milestones };
}

// ── Risks (ADR-007 tabulka: add_risk, update_risk) ──────────────────────────

function invertRiskCommand(
  command: Extract<ProjectCommand, { type: (typeof RISK_TYPES)[number] }>,
  prevState: AppState
): ProjectCommand | null {
  switch (command.type) {
    case 'add_risk':
      return { type: 'delete_risk', riskId: command.risk.id };
    case 'delete_risk': {
      const prevRisk = findById(prevState.risks, command.riskId);
      return prevRisk ? { type: 'add_risk', risk: prevRisk } : null;
    }
    case 'update_risk': {
      const prevRisk = findById(prevState.risks, command.riskId);
      return prevRisk
        ? {
            type: 'update_risk',
            riskId: command.riskId,
            fields: pickPrevFields<Risk>(prevRisk, command.fields),
          }
        : null;
    }
  }
}

// ── Opportunities (stejný vzor jako risks) ──────────────────────────────────

function invertOpportunityCommand(
  command: Extract<ProjectCommand, { type: (typeof OPPORTUNITY_TYPES)[number] }>,
  prevState: AppState
): ProjectCommand | null {
  switch (command.type) {
    case 'add_opportunity':
      return { type: 'delete_opportunity', oppId: command.opp.id };
    case 'delete_opportunity': {
      const prevOpp = findById(prevState.opps, command.oppId);
      return prevOpp ? { type: 'add_opportunity', opp: prevOpp } : null;
    }
    case 'update_opportunity': {
      const prevOpp = findById(prevState.opps, command.oppId);
      return prevOpp
        ? {
            type: 'update_opportunity',
            oppId: command.oppId,
            fields: pickPrevFields<Opportunity>(prevOpp, command.fields),
          }
        : null;
    }
  }
}

// ── Categories & Roles (celé nahrazení — inverze = předchozí hodnota) ──────

function invertConfigCommand(
  command: Extract<ProjectCommand, { type: (typeof CONFIG_TYPES)[number] }>,
  prevState: AppState
): ProjectCommand | null {
  return command.type === 'set_cats'
    ? { type: 'set_cats', cats: prevState.cats }
    : { type: 'set_roles', roles: prevState.roles };
}

// ── Knowledge base (stejný vzor jako risks) ─────────────────────────────────

function invertKbCommand(
  command: Extract<ProjectCommand, { type: (typeof KB_TYPES)[number] }>,
  prevState: AppState
): ProjectCommand | null {
  switch (command.type) {
    case 'add_kb_page':
      return { type: 'delete_kb_page', pageId: command.page.id };
    case 'delete_kb_page': {
      const prevPage = findById(prevState.kbPages, command.pageId);
      return prevPage ? { type: 'add_kb_page', page: prevPage } : null;
    }
    case 'update_kb_page': {
      const prevPage = findById(prevState.kbPages, command.pageId);
      return prevPage
        ? {
            type: 'update_kb_page',
            pageId: command.pageId,
            fields: pickPrevFields(prevPage, command.fields),
          }
        : null;
    }
  }
}

// ── TODO (per-user; command protokol ho routuje, ale nemá diff — viz ADR-004) ─

function invertTodoCommand(
  command: Extract<ProjectCommand, { type: (typeof TODO_TYPES)[number] }>,
  prevState: AppState
): ProjectCommand | null {
  switch (command.type) {
    case 'add_todo':
      return { type: 'delete_todo', todoId: command.todo.id };
    case 'delete_todo': {
      const prevTodo = findById(prevState.todos, command.todoId);
      return prevTodo ? { type: 'add_todo', todo: prevTodo } : null;
    }
    case 'update_todo': {
      const prevTodo = findById(prevState.todos, command.todoId);
      return prevTodo
        ? {
            type: 'update_todo',
            todoId: command.todoId,
            fields: pickPrevFields(prevTodo, command.fields),
          }
        : null;
    }
  }
}

// ── Reminders (stejný vzor jako TODO) ────────────────────────────────────────

function invertReminderCommand(
  command: Extract<ProjectCommand, { type: (typeof REMINDER_TYPES)[number] }>,
  prevState: AppState
): ProjectCommand | null {
  switch (command.type) {
    case 'add_reminder':
      return { type: 'delete_reminder', reminderId: command.reminder.id };
    case 'delete_reminder': {
      const prevReminder = findById(prevState.reminders, command.reminderId);
      return prevReminder ? { type: 'add_reminder', reminder: prevReminder } : null;
    }
    case 'update_reminder': {
      const prevReminder = findById(prevState.reminders, command.reminderId);
      return prevReminder
        ? {
            type: 'update_reminder',
            reminderId: command.reminderId,
            fields: pickPrevFields(prevReminder, command.fields),
          }
        : null;
    }
  }
}

// ── Import (full_state_import) — inverze je symetrická náhrada celého stavu ──

function invertFullStateImportCommand(prevState: AppState): ProjectCommand {
  return { type: 'full_state_import', state: prevState };
}

// ── Azure DevOps (jen `ado_save_config` má co invertovat, viz hlavička) ─────

function invertAdoSaveConfigCommand(prevState: AppState): ProjectCommand | null {
  return prevState.adoConfig ? { type: 'ado_save_config', config: prevState.adoConfig } : null;
}

// ── Vstupní bod ────────────────────────────────────────────────────────────

/**
 * Vrátí reverzní command k `command`, nebo `null`, pokud command není
 * invertovatelný (session commandy `undo`/`redo`, `update_presence`, PAT
 * commandy, ADO akční commandy) nebo entita, ke které se vztahoval,
 * v `prevState` neexistuje (nekonzistentní historie — např. po chybě
 * serveru a rollbacku).
 */
export function invertCommand(command: ProjectCommand, prevState: AppState): ProjectCommand | null {
  if (isOneOfType(command, NON_INVERTIBLE_TYPES)) return null;
  if (command.type === 'full_state_import') return invertFullStateImportCommand(prevState);
  if (command.type === 'ado_save_config') return invertAdoSaveConfigCommand(prevState);
  if (isOneOfType(command, TASK_TYPES)) return invertTaskCommand(command, prevState);
  if (isOneOfType(command, PERSON_TYPES)) return invertPersonCommand(command, prevState);
  if (isOneOfType(command, PROJECT_META_TYPES)) return invertProjectMetaCommand(command, prevState);
  if (isOneOfType(command, RISK_TYPES)) return invertRiskCommand(command, prevState);
  if (isOneOfType(command, OPPORTUNITY_TYPES)) return invertOpportunityCommand(command, prevState);
  if (isOneOfType(command, CONFIG_TYPES)) return invertConfigCommand(command, prevState);
  if (isOneOfType(command, KB_TYPES)) return invertKbCommand(command, prevState);
  if (isOneOfType(command, TODO_TYPES)) return invertTodoCommand(command, prevState);
  if (command.type === 'update_file_note') return invertFileNoteCommand(command, prevState);
  return invertReminderCommand(command, prevState);
}

/** Poznámka k souboru je text jako každý jiný — vrací se na předchozí hodnotu. */
function invertFileNoteCommand(
  command: Extract<ProjectCommand, { type: 'update_file_note' }>,
  prevState: AppState
): ProjectCommand | null {
  const previous = prevState.files.find((file) => file.id === command.fileId);
  if (!previous) return null;
  return { type: 'update_file_note', fileId: command.fileId, note: previous.note };
}
