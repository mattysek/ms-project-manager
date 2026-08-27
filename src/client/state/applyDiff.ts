// Čistá redukce ProjectDiff → AppState (FR-COLLAB-03, ADR-004).
//
// Diffy jsou malé a cílené na jednu entitu — žádný diff s výjimkou `full_state`
// nenese celý stav projektu. `applyDiff` je čistá funkce bez side-efektů, aby
// šla snadno testovat a volat jak pro diffy od jiných uživatelů, tak (po
// zavedení commandového undo, ADR-007) pro rollback při chybě.
//
// Diffy, které doménový stav projektu (`AppState`) nemění — `applyDiff` je
// vrací beze změny, protože nesou efemérní/session data popsaná v ADR-004
// doplňku „Presence není součástí AppState":
//  - `error` řeší volající — rollback poslední optimistické změny + notifikace
//    uživateli (FR-COLLAB-03); `applyDiff` sám o sobě neví, co bylo poslední
//    optimisticky aplikované, to drží `lastConfirmedState` na vyšší úrovni.
//  - `presence` je efemérní UI stav (kdo je online, na jaké záložce).
//  - `role_changed` je role uživatele v RÁMCI PROJEKTU (pm/dev) — session
//    kontext přihlášeného uživatele, ne data projektu jako taková; obdoba
//    presence (PRD-03, FR-ROLE-06).
//  - `ado_sync_progress` je průběžný stav běžícího syncu (FR-ADO-04), zobrazí
//    se jen iniciátorovi a nikdy se nepersistuje.
//  - `ado_pat_saved` a `ado_connection_tested` jsou per-user stav PATu a
//    výsledek jednorázového ověření (FR-ADO-02, FR-ADO-03) — do dat projektu
//    nepatří (ADR-004 doplněk, „Stav mimo AppState"). Konzumuje je `useAdoSync`.
import type { Person } from '../types';
import type { ProjectDiff } from '../types/protocol';
import type { AppState } from './appState';

type DiffOp = ProjectDiff['op'];

function isOneOfOp<T extends DiffOp>(
  diff: ProjectDiff,
  ops: readonly T[]
): diff is Extract<ProjectDiff, { op: T }> {
  return (ops as readonly string[]).includes(diff.op);
}

function replaceById<T extends { id: string }>(list: T[], id: string, fields: Partial<T>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...fields } : item));
}

function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((item) => item.id !== id);
}

/**
 * Přidání, které nesmí vzniknout dvakrát.
 *
 * Autor commandu ho aplikuje optimisticky (`applyCommandOptimistically`) a
 * VZÁPĚTÍ dostane od serveru vlastní `*_added` diff zpátky — `Clients.Group`
 * zahrnuje i odesílatele a `SenderOnly` míří přímo na něj. Prostý `[...list,
 * item]` tím pádem tutéž položku přidal podruhé a autor ji viděl dvakrát až do
 * nejbližšího `full_state` (typicky do reloadu stránky).
 *
 * Id generuje klient (`uid()`), takže je stejné v optimistické kopii i v diffu
 * — echo se pozná podle něj a jen přepíše serverovou verzí (ta je autoritativní,
 * nese třeba `updatedBy`/`updatedAt` doplněné reducerem). Pořadí zůstává na
 * místě, kam položku vložila optimistická aplikace.
 */
function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...list, item];
  return list.map((existing, i) => (i === index ? item : existing));
}

const TASK_OPS = ['task_added', 'task_updated', 'task_deleted'] as const;
const PERSON_OPS = ['person_added', 'person_updated', 'person_deleted', 'alloc_updated'] as const;
const PROJECT_META_OPS = [
  'project_updated',
  'milestones_set',
  'milestone_checklist_updated',
] as const;
const RISK_OPS = ['risk_added', 'risk_updated', 'risk_deleted'] as const;
const OPPORTUNITY_OPS = [
  'opportunity_added',
  'opportunity_updated',
  'opportunity_deleted',
] as const;
const CONFIG_OPS = ['cats_set', 'roles_set'] as const;
const KB_OPS = ['kb_page_added', 'kb_page_updated', 'kb_page_deleted'] as const;
const TODO_OPS = ['todo_added', 'todo_updated', 'todo_deleted'] as const;
const REMINDER_OPS = ['reminder_added', 'reminder_updated', 'reminder_deleted'] as const;
const FILE_OPS = ['file_added', 'file_note_updated', 'file_deleted'] as const;
/** Diffy s efemérním/session obsahem — viz komentář v hlavičce souboru. */
const NO_STATE_CHANGE_OPS = [
  'error',
  'presence',
  'role_changed',
  'ado_sync_progress',
  'ado_pat_saved',
  'ado_connection_tested',
] as const;
const ADO_OPS = ['ado_config_updated', 'ado_sync_completed', 'ado_sync_log_appended'] as const;

// ── Doménové redukce ───────────────────────────────────────────────────────

function applyTaskDiff(
  state: AppState,
  diff: Extract<ProjectDiff, { op: (typeof TASK_OPS)[number] }>
): AppState {
  switch (diff.op) {
    case 'task_added':
      return { ...state, tasks: upsertById(state.tasks, diff.task) };
    case 'task_updated':
      return { ...state, tasks: replaceById(state.tasks, diff.taskId, diff.fields) };
    case 'task_deleted':
      return { ...state, tasks: removeById(state.tasks, diff.taskId) };
  }
}

function applyPersonDiff(
  state: AppState,
  diff: Extract<ProjectDiff, { op: (typeof PERSON_OPS)[number] }>
): AppState {
  switch (diff.op) {
    case 'person_added':
      return { ...state, people: upsertById(state.people, diff.person) };
    case 'person_updated':
      return { ...state, people: replaceById(state.people, diff.personId, diff.fields) };
    case 'person_deleted':
      return { ...state, people: removeById(state.people, diff.personId) };
    case 'alloc_updated':
      return { ...state, people: applyAlloc(state.people, diff) };
  }
}

/** Alokace se mění po jednom týdnu, ne přepisem celého `weekAlloc`. */
function applyAlloc(
  people: Person[],
  diff: Extract<ProjectDiff, { op: 'alloc_updated' }>
): Person[] {
  return people.map((person) => {
    if (person.id !== diff.personId) return person;
    const weekAlloc = [...person.weekAlloc];
    weekAlloc[diff.weekIdx] = diff.pct;
    return { ...person, weekAlloc };
  });
}

function applyProjectMetaDiff(
  state: AppState,
  diff: Extract<ProjectDiff, { op: (typeof PROJECT_META_OPS)[number] }>
): AppState {
  if (diff.op === 'project_updated') {
    return { ...state, project: { ...state.project, ...diff.fields } };
  }
  if (diff.op === 'milestones_set') {
    return { ...state, project: { ...state.project, milestones: diff.milestones } };
  }
  const milestones = state.project.milestones.map((milestone) =>
    milestone.id === diff.milestoneId ? { ...milestone, checkItems: diff.checkItems } : milestone
  );
  return { ...state, project: { ...state.project, milestones } };
}

function applyRiskDiff(
  state: AppState,
  diff: Extract<ProjectDiff, { op: (typeof RISK_OPS)[number] }>
): AppState {
  switch (diff.op) {
    case 'risk_added':
      return { ...state, risks: upsertById(state.risks, diff.risk) };
    case 'risk_updated':
      return { ...state, risks: replaceById(state.risks, diff.riskId, diff.fields) };
    case 'risk_deleted':
      return { ...state, risks: removeById(state.risks, diff.riskId) };
  }
}

function applyOpportunityDiff(
  state: AppState,
  diff: Extract<ProjectDiff, { op: (typeof OPPORTUNITY_OPS)[number] }>
): AppState {
  switch (diff.op) {
    case 'opportunity_added':
      return { ...state, opps: upsertById(state.opps, diff.opp) };
    case 'opportunity_updated':
      return { ...state, opps: replaceById(state.opps, diff.oppId, diff.fields) };
    case 'opportunity_deleted':
      return { ...state, opps: removeById(state.opps, diff.oppId) };
  }
}

function applyConfigDiff(
  state: AppState,
  diff: Extract<ProjectDiff, { op: (typeof CONFIG_OPS)[number] }>
): AppState {
  return diff.op === 'cats_set' ? { ...state, cats: diff.cats } : { ...state, roles: diff.roles };
}

function applyKbDiff(
  state: AppState,
  diff: Extract<ProjectDiff, { op: (typeof KB_OPS)[number] }>
): AppState {
  switch (diff.op) {
    case 'kb_page_added':
      return { ...state, kbPages: upsertById(state.kbPages, diff.page) };
    case 'kb_page_updated':
      return { ...state, kbPages: replaceById(state.kbPages, diff.pageId, diff.fields) };
    case 'kb_page_deleted':
      return { ...state, kbPages: removeById(state.kbPages, diff.pageId) };
  }
}

// ── TODO / Reminders (per-user; doručeno jen odesílateli — ADR-004 doplněk) ──

function applyTodoDiff(
  state: AppState,
  diff: Extract<ProjectDiff, { op: (typeof TODO_OPS)[number] }>
): AppState {
  switch (diff.op) {
    case 'todo_added':
      return { ...state, todos: upsertById(state.todos, diff.todo) };
    case 'todo_updated':
      return { ...state, todos: replaceById(state.todos, diff.todoId, diff.fields) };
    case 'todo_deleted':
      return { ...state, todos: removeById(state.todos, diff.todoId) };
  }
}

function applyReminderDiff(
  state: AppState,
  diff: Extract<ProjectDiff, { op: (typeof REMINDER_OPS)[number] }>
): AppState {
  switch (diff.op) {
    case 'reminder_added':
      return { ...state, reminders: upsertById(state.reminders, diff.reminder) };
    case 'reminder_updated':
      return { ...state, reminders: replaceById(state.reminders, diff.reminderId, diff.fields) };
    case 'reminder_deleted':
      return { ...state, reminders: removeById(state.reminders, diff.reminderId) };
  }
}

// ── Soubory (ADR-010 — pouze FileRef metadata, bez dat) ──────────────────────

function applyFileDiff(
  state: AppState,
  diff: Extract<ProjectDiff, { op: (typeof FILE_OPS)[number] }>
): AppState {
  switch (diff.op) {
    case 'file_added':
      // Uploadující klient přidá soubor lokálně hned po REST odpovědi
      // (`useFilesCommand.addFileLocally`), takže `file_added` z broadcastu
      // (dorazí i odesílateli) by ho jinak zdvojil — stejný echo problém jako
      // u ostatních entit, viz `upsertById`.
      return { ...state, files: upsertById(state.files, diff.file) };
    case 'file_note_updated':
      return { ...state, files: replaceById(state.files, diff.fileId, { note: diff.note }) };
    case 'file_deleted':
      return { ...state, files: removeById(state.files, diff.fileId) };
  }
}

// ── Azure DevOps (config + sync log; PAT se sem nikdy nepromítá) ─────────────

/**
 * Sync log je součástí stavu projektu (ADR-008) a je to **append-only audit**
 * (FR-ADO-10) — nový záznam se přidává na začátek, aby řazení sestupně podle
 * času odpovídalo serveru (`entry :: state.AdoSyncLog` v `AdoGateway`).
 */
function applyAdoDiff(
  state: AppState,
  diff: Extract<ProjectDiff, { op: (typeof ADO_OPS)[number] }>
): AppState {
  switch (diff.op) {
    case 'ado_config_updated':
      return { ...state, adoConfig: diff.config };
    case 'ado_sync_completed':
      return { ...state, adoSyncLog: diff.log };
    case 'ado_sync_log_appended':
      return { ...state, adoSyncLog: [diff.entry, ...state.adoSyncLog] };
  }
}

// ── Vstupní bod ────────────────────────────────────────────────────────────

export function applyDiff(state: AppState, diff: ProjectDiff): AppState {
  if (diff.op === 'full_state') return diff.state;
  if (isOneOfOp(diff, NO_STATE_CHANGE_OPS)) return state;
  if (isOneOfOp(diff, TASK_OPS)) return applyTaskDiff(state, diff);
  if (isOneOfOp(diff, PERSON_OPS)) return applyPersonDiff(state, diff);
  if (isOneOfOp(diff, PROJECT_META_OPS)) return applyProjectMetaDiff(state, diff);
  if (isOneOfOp(diff, RISK_OPS)) return applyRiskDiff(state, diff);
  if (isOneOfOp(diff, OPPORTUNITY_OPS)) return applyOpportunityDiff(state, diff);
  if (isOneOfOp(diff, CONFIG_OPS)) return applyConfigDiff(state, diff);
  if (isOneOfOp(diff, KB_OPS)) return applyKbDiff(state, diff);
  if (isOneOfOp(diff, TODO_OPS)) return applyTodoDiff(state, diff);
  if (isOneOfOp(diff, REMINDER_OPS)) return applyReminderDiff(state, diff);
  if (isOneOfOp(diff, FILE_OPS)) return applyFileDiff(state, diff);
  return applyAdoDiff(state, diff);
}
