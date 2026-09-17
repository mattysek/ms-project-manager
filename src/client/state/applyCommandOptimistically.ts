// Optimistická aplikace ProjectCommand na klientský AppState (ADR-004 „Optimistická
// aplikace"; ADR-009 offline režim).
//
// `applyDiff` redukuje DIFFY přijaté ze serveru. Tahle funkce dělá totéž pro
// COMMANDY těsně předtím, než je server potvrdí — klient si nemůže dovolit čekat
// na round-trip, takže mutaci provede lokálně hned. Je to zrcadlový pattern k
// `applyDiff` (stejné `replaceById`/`removeById` helpery, stejné seskupení podle
// entity), ale nad tvarem `ProjectCommand`, který nese jiná pole než odpovídající
// diff (např. `move_task` nese `taskId` přímo, ne zabalené v `fields`).
//
// Používá se na dvou místech:
//  - online: jako `applyOptimistic` callback předaný do `channel.sendCommand`
//  - offline: jako přímá mutace přes `channel.applyLocal` (ADR-009, offline queue)
//
// Commandy beze změny doménového stavu (`update_presence`, `undo`/`redo`, ADO
// akční commandy bez okamžitého efektu) vrací stav beze změny — server výsledek
// pošle zpět jako diff (nebo commandy `undo`/`redo` server rovnou odmítne, viz
// ADR-004 doplněk).
import type { ProjectCommand } from '../types/protocol';
import type { AppState } from './appState';

function replaceById<T extends { id: string }>(list: T[], id: string, fields: Partial<T>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...fields } : item));
}

function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((item) => item.id !== id);
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
/** Jediný souborový command, který klient posílá jako `ProjectCommand` (viz `protocol.ts`). */
const FILE_TYPES = ['update_file_note'] as const;
/**
 * Commandy beze změny AppState — session/akční, viz hlavička souboru.
 *
 * ADO akční commandy tu jsou **všechny**: jejich efekt vzniká až po volání ADO
 * API na serveru (nový úkol, patch úkolu, záznam v logu) a vrací se zpátky jako
 * běžný `task_added`/`task_updated`/`ado_sync_log_appended` diff. Optimisticky
 * je aplikovat nelze — klient nezná ani ID nového work itemu, ani to, jestli
 * volání do ADO vůbec projde; a u `ado_add_gap_to_plan` by úkol vznikl dvakrát.
 */
const NO_STATE_CHANGE_TYPES = [
  'update_presence',
  'undo',
  'redo',
  'ado_delete_pat',
  'ado_save_pat',
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

type CmdType = ProjectCommand['type'];

function isOneOfType<T extends CmdType>(
  command: ProjectCommand,
  types: readonly T[]
): command is Extract<ProjectCommand, { type: T }> {
  return (types as readonly string[]).includes(command.type);
}

function applyTaskCommand(
  state: AppState,
  command: Extract<ProjectCommand, { type: (typeof TASK_TYPES)[number] }>
): AppState {
  switch (command.type) {
    case 'add_task':
      return { ...state, tasks: [...state.tasks, command.task] };
    case 'update_task':
      return { ...state, tasks: replaceById(state.tasks, command.taskId, command.fields) };
    case 'move_task':
      return {
        ...state,
        tasks: replaceById(state.tasks, command.taskId, { s: command.s, e: command.e }),
      };
    case 'update_progress':
      return {
        ...state,
        tasks: replaceById(state.tasks, command.taskId, { progress: command.progress }),
      };
    case 'delete_task':
      return { ...state, tasks: removeById(state.tasks, command.taskId) };
  }
}

function applyPersonCommand(
  state: AppState,
  command: Extract<ProjectCommand, { type: (typeof PERSON_TYPES)[number] }>
): AppState {
  switch (command.type) {
    case 'add_person':
      return { ...state, people: [...state.people, command.person] };
    case 'update_person':
      return { ...state, people: replaceById(state.people, command.personId, command.fields) };
    case 'delete_person':
      return { ...state, people: removeById(state.people, command.personId) };
    case 'update_alloc':
      return {
        ...state,
        people: state.people.map((p) =>
          p.id === command.personId
            ? {
                ...p,
                weekAlloc: p.weekAlloc.map((v, i) => (i === command.weekIdx ? command.pct : v)),
              }
            : p
        ),
      };
  }
}

function applyProjectMetaCommand(
  state: AppState,
  command: Extract<ProjectCommand, { type: (typeof PROJECT_META_TYPES)[number] }>
): AppState {
  if (command.type === 'update_project') {
    return { ...state, project: { ...state.project, ...command.fields } };
  }
  return { ...state, project: { ...state.project, milestones: command.milestones } };
}

function applyRiskCommand(
  state: AppState,
  command: Extract<ProjectCommand, { type: (typeof RISK_TYPES)[number] }>
): AppState {
  switch (command.type) {
    case 'add_risk':
      return { ...state, risks: [...state.risks, command.risk] };
    case 'update_risk':
      return { ...state, risks: replaceById(state.risks, command.riskId, command.fields) };
    case 'delete_risk':
      return { ...state, risks: removeById(state.risks, command.riskId) };
  }
}

function applyOpportunityCommand(
  state: AppState,
  command: Extract<ProjectCommand, { type: (typeof OPPORTUNITY_TYPES)[number] }>
): AppState {
  switch (command.type) {
    case 'add_opportunity':
      return { ...state, opps: [...state.opps, command.opp] };
    case 'update_opportunity':
      return { ...state, opps: replaceById(state.opps, command.oppId, command.fields) };
    case 'delete_opportunity':
      return { ...state, opps: removeById(state.opps, command.oppId) };
  }
}

function applyConfigCommand(
  state: AppState,
  command: Extract<ProjectCommand, { type: (typeof CONFIG_TYPES)[number] }>
): AppState {
  return command.type === 'set_cats'
    ? { ...state, cats: command.cats }
    : { ...state, roles: command.roles };
}

function applyKbCommand(
  state: AppState,
  command: Extract<ProjectCommand, { type: (typeof KB_TYPES)[number] }>
): AppState {
  switch (command.type) {
    case 'add_kb_page':
      return { ...state, kbPages: [...state.kbPages, command.page] };
    case 'update_kb_page':
      return { ...state, kbPages: replaceById(state.kbPages, command.pageId, command.fields) };
    case 'delete_kb_page':
      return { ...state, kbPages: removeById(state.kbPages, command.pageId) };
  }
}

function applyTodoCommand(
  state: AppState,
  command: Extract<ProjectCommand, { type: (typeof TODO_TYPES)[number] }>
): AppState {
  switch (command.type) {
    case 'add_todo':
      return { ...state, todos: [...state.todos, command.todo] };
    case 'update_todo':
      return { ...state, todos: replaceById(state.todos, command.todoId, command.fields) };
    case 'delete_todo':
      return { ...state, todos: removeById(state.todos, command.todoId) };
  }
}

function applyReminderCommand(
  state: AppState,
  command: Extract<ProjectCommand, { type: (typeof REMINDER_TYPES)[number] }>
): AppState {
  switch (command.type) {
    case 'add_reminder':
      return { ...state, reminders: [...state.reminders, command.reminder] };
    case 'update_reminder':
      return {
        ...state,
        reminders: replaceById(state.reminders, command.reminderId, command.fields),
      };
    case 'delete_reminder':
      return { ...state, reminders: removeById(state.reminders, command.reminderId) };
  }
}

function applyFileCommand(
  state: AppState,
  command: Extract<ProjectCommand, { type: (typeof FILE_TYPES)[number] }>
): AppState {
  return { ...state, files: replaceById(state.files, command.fileId, { note: command.note }) };
}

export function applyCommandOptimistically(state: AppState, command: ProjectCommand): AppState {
  if (command.type === 'full_state_import') return command.state;
  if (command.type === 'ado_save_config') return { ...state, adoConfig: command.config };
  if (isOneOfType(command, NO_STATE_CHANGE_TYPES)) return state;
  if (isOneOfType(command, TASK_TYPES)) return applyTaskCommand(state, command);
  if (isOneOfType(command, PERSON_TYPES)) return applyPersonCommand(state, command);
  if (isOneOfType(command, PROJECT_META_TYPES)) return applyProjectMetaCommand(state, command);
  if (isOneOfType(command, RISK_TYPES)) return applyRiskCommand(state, command);
  if (isOneOfType(command, OPPORTUNITY_TYPES)) return applyOpportunityCommand(state, command);
  if (isOneOfType(command, CONFIG_TYPES)) return applyConfigCommand(state, command);
  if (isOneOfType(command, KB_TYPES)) return applyKbCommand(state, command);
  if (isOneOfType(command, TODO_TYPES)) return applyTodoCommand(state, command);
  if (isOneOfType(command, REMINDER_TYPES)) return applyReminderCommand(state, command);
  return applyFileCommand(state, command);
}
