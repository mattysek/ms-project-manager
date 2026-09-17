// Command-based protokol klient ↔ server přes SignalR — viz ADR-004.
//
// Toto je kontrakt s F# backendem (`ServerCommand`/`ServerDiff`); typy jsou
// vytvořené **doslova** podle seznamu v ADR-004 a jeho sekce „Doplněk —
// mezery zjištěné při implementaci". Při přidání nového commandu nebo diffu
// je nutné zrcadlit změnu na obou stranách — nesynchronizovanost je jedna
// z pojmenovaných "Negativních" důsledků ADR-004.
//
// Klient posílá `ProjectCommand`, server ho zpracuje v `ProjectActor` a
// broadcastuje `ProjectDiff` — buď celé skupině `project:{projectId}`, nebo
// (pro per-user data a chybové odpovědi) jen spojení odesílatele. Routing
// tabulka je v ADR-004 doplňku; klient ji nepotřebuje znát pro *příjem*
// diffů (`ReceiveDiff` dostane vše, co mu server pošle), jen pro pochopení,
// proč např. `todo_added` od jiného uživatele nikdy nepřijde.

import type {
  ADOAcceptField,
  ADOConfig,
  ADOSyncContext,
  ADOSyncLogEntry,
  ADOWorkItemDraft,
  ADOWorkItemView,
  Categories,
  FileRef,
  KBPage,
  Milestone,
  MilestoneCheckItem,
  Opportunity,
  Person,
  Project,
  RecurringReminder,
  Risk,
  Roles,
  Task,
  TodoItem,
  WIChange,
  WIChangeType,
} from './index';
import type { AppState } from '../state/appState';

/** Role člena projektu (ne zaměňovat s `Roles` — to jsou pracovní role osob typu BE/FE). */
export type MemberRole = 'pm' | 'dev';

// ── Klient → Server ──────────────────────────────────────────────────────────

export type ProjectCommand =
  // Tasks
  | { type: 'add_task'; task: Task }
  | { type: 'update_task'; taskId: string; fields: Partial<Task> }
  | { type: 'move_task'; taskId: string; s: number; e: number }
  | { type: 'update_progress'; taskId: string; progress: number }
  | { type: 'delete_task'; taskId: string }
  // People
  | { type: 'add_person'; person: Person }
  | { type: 'update_person'; personId: string; fields: Partial<Person> }
  | { type: 'delete_person'; personId: string }
  | { type: 'update_alloc'; personId: string; weekIdx: number; pct: number }
  // Project metadata
  | { type: 'update_project'; fields: Partial<Project> }
  | { type: 'set_milestones'; milestones: Milestone[] }
  // Risks & Opportunities
  | { type: 'add_risk'; risk: Risk }
  | { type: 'update_risk'; riskId: string; fields: Partial<Risk> }
  | { type: 'delete_risk'; riskId: string }
  | { type: 'add_opportunity'; opp: Opportunity }
  | { type: 'update_opportunity'; oppId: string; fields: Partial<Opportunity> }
  | { type: 'delete_opportunity'; oppId: string }
  // Categories & Roles
  | { type: 'set_cats'; cats: Categories }
  | { type: 'set_roles'; roles: Roles }
  // KB
  | { type: 'add_kb_page'; page: KBPage }
  | { type: 'update_kb_page'; pageId: string; fields: Partial<KBPage> }
  | { type: 'delete_kb_page'; pageId: string }
  // TODO (per user — server routing)
  | { type: 'add_todo'; todo: TodoItem }
  | { type: 'update_todo'; todoId: string; fields: Partial<TodoItem> }
  | { type: 'delete_todo'; todoId: string }
  | { type: 'add_reminder'; reminder: RecurringReminder }
  | { type: 'update_reminder'; reminderId: string; fields: Partial<RecurringReminder> }
  | { type: 'delete_reminder'; reminderId: string }
  // Soubory (ADR-010) — jen editace poznámky. `add_file`/`delete_file` jde
  // přes REST (`src/api/filesApi.ts`), server je posílá sám sobě po
  // uploadu/smazání; poznámka je pár znaků textu, ne BLOB, takže jde běžným
  // command kanálem jako kterékoli jiné pole.
  | { type: 'update_file_note'; fileId: string; note: string }
  // Presence (PRD-02, FR-COLLAB-04)
  | { type: 'update_presence'; view: string }
  // Import (ADR-005 „Důsledky" — parsing je klientský, výsledek jde jako jeden command)
  | { type: 'full_state_import'; state: AppState }
  // Azure DevOps — konfigurace a PAT (PRD-06 FR-ADO-01 až 03, ADR-008)
  | { type: 'ado_save_config'; config: ADOConfig }
  | { type: 'ado_save_pat'; pat: string }
  | { type: 'ado_delete_pat' }
  /**
   * Dotaz na stav PATu (FR-ADO-02). PAT ani informace o jeho existenci nejsou
   * součástí `AppState` — jsou per-user — takže po reloadu klient netuší, že
   * nějaký uložený je, a odpověď `ado_pat_saved` je jediná cesta, jak se to
   * dozvědět bez nového uložení.
   */
  | { type: 'ado_request_status' }
  | { type: 'ado_test_connection' }
  | { type: 'ado_run_sync' }
  // Azure DevOps — rozhodnutí uživatele nad výsledkem (FR-ADO-06, FR-ADO-09).
  // Server je zapisuje do snapshotu a **žádný diff za ně neposílá** — mizení
  // změny ze seznamu si klient odvodí sám (viz `useAdoSync`).
  | {
      type: 'ado_acknowledge_change';
      wiId: number;
      changeType: WIChangeType;
      acknowledged: boolean;
    }
  | { type: 'ado_ignore_gap'; wiId: number; ignored: boolean }
  | { type: 'ado_ignore_unlinked_task'; taskId: string; ignored: boolean }
  // Převzetí hodnoty z ADO do plánovače (FR-ADO-06). `text` nese sloučený popis
  // při obousměrném merge; chybí-li, vezme se popis z ADO tak, jak je.
  | {
      type: 'ado_accept_from_ado';
      wiId: number;
      taskId: string;
      field: ADOAcceptField;
      text?: string;
    }
  // Azure DevOps — zápis do ADO (FR-ADO-07, FR-ADO-08)
  | { type: 'ado_push_assignee'; wiId: number; taskId: string }
  | { type: 'ado_push_state'; wiId: number; taskId: string; state: string }
  /** `alsoPlanner` = merge obousměrně: popis se uloží i na úkol. */
  | {
      type: 'ado_push_description';
      wiId: number;
      taskId: string;
      text: string;
      alsoPlanner: boolean;
    }
  | { type: 'ado_create_work_item'; taskId: string; draft: ADOWorkItemDraft }
  // Azure DevOps — coverage gap → plán (FR-ADO-09)
  | { type: 'ado_add_gap_to_plan'; wiId: number; task: Task }
  | { type: 'ado_link_gap_to_task'; wiId: number; taskId: string }
  // Session
  | { type: 'undo' }
  | { type: 'redo' };

/** Sjednocení literálních typů `ProjectCommand["type"]` — pohodlné pro dispatch. */
export type ProjectCommandType = ProjectCommand['type'];

// ── Server → Klient (diffy) ───────────────────────────────────────────────────

/** Kdo je online na jakém view — viz FR-COLLAB-04. */
export interface PresenceEntry {
  userId: string;
  displayName: string;
  view: string;
  color: string;
}

export type ProjectDiff =
  | { op: 'task_added'; task: Task }
  | { op: 'task_updated'; taskId: string; fields: Partial<Task> }
  | { op: 'task_deleted'; taskId: string }
  | { op: 'person_added'; person: Person }
  | { op: 'person_updated'; personId: string; fields: Partial<Person> }
  | { op: 'person_deleted'; personId: string }
  | { op: 'alloc_updated'; personId: string; weekIdx: number; pct: number }
  | { op: 'project_updated'; fields: Partial<Project> }
  | { op: 'milestones_set'; milestones: Milestone[] }
  // Položky checklistu milníku smí editovat i Dev, kdežto `set_milestones` je
  // PM-only — proto samostatný diff (FR-ROLE-01).
  | { op: 'milestone_checklist_updated'; milestoneId: string; checkItems: MilestoneCheckItem[] }
  | { op: 'risk_added'; risk: Risk }
  | { op: 'risk_updated'; riskId: string; fields: Partial<Risk> }
  | { op: 'risk_deleted'; riskId: string }
  | { op: 'opportunity_added'; opp: Opportunity }
  | { op: 'opportunity_updated'; oppId: string; fields: Partial<Opportunity> }
  | { op: 'opportunity_deleted'; oppId: string }
  | { op: 'cats_set'; cats: Categories }
  | { op: 'roles_set'; roles: Roles }
  | { op: 'kb_page_added'; page: KBPage }
  | { op: 'kb_page_updated'; pageId: string; fields: Partial<KBPage> }
  | { op: 'kb_page_deleted'; pageId: string }
  // TODO / Reminders — doručeno pouze spojení odesílatele (per-user data, viz doplněk ADR-004)
  | { op: 'todo_added'; todo: TodoItem }
  | { op: 'todo_updated'; todoId: string; fields: Partial<TodoItem> }
  | { op: 'todo_deleted'; todoId: string }
  | { op: 'reminder_added'; reminder: RecurringReminder }
  | { op: 'reminder_updated'; reminderId: string; fields: Partial<RecurringReminder> }
  | { op: 'reminder_deleted'; reminderId: string }
  // Soubory (ADR-010, upload flow krok 4) — broadcast celé skupině
  | { op: 'file_added'; file: FileRef }
  | { op: 'file_note_updated'; fileId: string; note: string }
  | { op: 'file_deleted'; fileId: string }
  // Role — doručeno pouze spojení dotčeného uživatele (PRD-03, FR-ROLE-06)
  | { op: 'role_changed'; newRole: MemberRole }
  // Azure DevOps — `patSet`/`patUpdatedAt` jsou per-user stav PATu, ne součást
  // `AppState` (ADR-004 doplněk); samotný PAT se ke klientovi nikdy nevrací.
  // Chybějící `patUpdatedAt` znamená „PAT nikdy nebyl uložen" — server pole
  // typu `option` neserializuje vůbec (`WithSkippableOptionFields`).
  | { op: 'ado_config_updated'; config: ADOConfig; patSet: boolean; patUpdatedAt?: string | null }
  | { op: 'ado_pat_saved'; patSet: boolean; patUpdatedAt?: string | null }
  /** Výsledek „Ověřit připojení" (FR-ADO-03) — zobrazuje se inline, ne jako popup. */
  | { op: 'ado_connection_tested'; ok: boolean; message: string }
  // Průběh syncu (FR-ADO-04) — jen iniciátorovi syncu.
  | { op: 'ado_sync_progress'; phase: string; completed: number; total: number }
  | {
      op: 'ado_sync_completed';
      changes: WIChange[];
      gaps: ADOWorkItemView[];
      log: ADOSyncLogEntry[];
      context: ADOSyncContext;
    }
  /** Přírůstek sync logu (FR-ADO-10) — log je append-only audit, nejnovější nahoře. */
  | { op: 'ado_sync_log_appended'; entry: ADOSyncLogEntry }
  | { op: 'full_state'; state: AppState } // pouze při prvním připojení nebo reconnect
  | { op: 'error'; message: string; commandType: string } // pouze spojení odesílatele
  | { op: 'presence'; users: PresenceEntry[] }; // kdo je online na jakém view

/** Sjednocení literálních typů `ProjectDiff["op"]` — pohodlné pro dispatch. */
export type ProjectDiffOp = ProjectDiff['op'];
