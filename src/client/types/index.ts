// ── Project Types ──────────────────────────────────────────────────────────────

export interface ChangelogEntry {
  id: string;
  date: string;
  text: string;
}

// ── Milestone Types ────────────────────────────────────────────────────────────

export interface MilestoneCheckItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  /**
   * **0-based** index do `Week[]` — na rozdíl od `Task.s`/`Task.e`, které jsou
   * 1-based. Ten rozdíl je vědomý, viz ADR-014: obě konvence už jsou v
   * uložených `state_json` i v exportech, takže sjednocení by znamenalo
   * migraci dat kvůli kosmetice.
   */
  weekIndex: number;
  checkItems: MilestoneCheckItem[];
}

export interface Project {
  name: string;
  startDate: string;
  endDate: string;
  budget: number;
  milestones: Milestone[]; // Changed from Record<number, string | undefined>
  notes: string;
  changelog: ChangelogEntry[];
}

// ── Role Types ────────────────────────────────────────────────────────────────

export interface RoleDefinition {
  label: string;
}

export type Roles = Record<string, RoleDefinition>;

// ── Person Types ───────────────────────────────────────────────────────────────

export interface Person {
  id: string;
  name: string;
  role: string; // role key
  color: string;
  weekAlloc: number[];
  // Vazba na účet v AspNetUsers (ADR-006, doplněk „vlastní" znamená co?).
  // `null` = osoba bez účtu (externista) — editovat ji smí jen PM.
  //
  // Povinné schválně, i když je hodnota skoro vždycky `null`: F# `Person` má
  // `UserId: string | null` jako běžné pole, takže mu ho `FSharp.SystemTextJson`
  // musí najít v JSONu. Když ho klient vynechal, celý `add_person` skončil na
  // `InvalidDataException: Error binding arguments` a osoba nešla přidat vůbec.
  // Volitelné pole tuhle chybu schovávalo až do běhu; povinné ji dělá z
  // překlepu chybu překladu.
  userId: string | null;
}

export interface PersonWithWeeks extends Person {
  _weeks: Week[];
}

// ── ADO Note (forward declaration for Task) ───────────────────────────────────

export interface ADONote {
  ts: string;
  text: string;
}

// ── Task Types ─────────────────────────────────────────────────────────────────

export interface TaskLink {
  id: string;
  label: string;
  url: string;
}

export interface Task {
  id: string;
  p: string; // person id
  name: string;
  cat: string; // category key
  /**
   * Rozsah úkolu na časové ose, **1-based** (ADR-014): `1` je první týden
   * projektu, `weekCount` poslední. Do pole `Week[]` se indexuje
   * `weeks[s - 1]`. Pozor, `Milestone.weekIndex` je naopak 0-based.
   */
  s: number;
  e: number;
  md: number; // man-days
  progress: number; // 0-100 percent complete
  desc: string;
  links: TaskLink[];
  adoNotes?: ADONote[]; // Poznámky z ADO sync
  /**
   * Kdo a kdy úkol naposledy změnil. Razítkuje **server** při každé mutaci;
   * klient je nikdy neposílá (a poslat je nemá smysl — přepíšou se).
   * Chybí jen u úkolů založených před zavedením pole.
   */
  updatedBy?: string;
  updatedAt?: string;
}

export interface TaskWithLane extends Task {
  lane: number;
}

// ── Category Types ─────────────────────────────────────────────────────────────

export interface Category {
  bg: string;
  bd: string;
  tx: string;
  label: string;
}

export type Categories = Record<string, Category>;

// ── Risk & Opportunity Types ───────────────────────────────────────────────────

export type Severity = 'high' | 'med' | 'low';

export interface Risk {
  id: string;
  sev: Severity;
  who: string;
  title: string;
  detail: string;
}

export interface Opportunity {
  id: string;
  title: string;
  detail: string;
}

// ── Week Types ─────────────────────────────────────────────────────────────────

export interface Week {
  w: number;
  label: string;
  dl: string | null;
  mIdx: number;
  workdays: number;
  mondayISO: string;
  fridayISO: string;
}

export interface WeekWithHolidays extends Week {
  holidays: { iso: string; name: string }[];
}

export interface MonthGroup {
  mIdx: number;
  label: string;
  weeks: number;
  color: string;
}

// ── Drag State ─────────────────────────────────────────────────────────────────

export type DragMode = 'move' | 'resize-left' | 'resize-right';

export interface DragState {
  id: string;
  offsetW: number;
  mode: DragMode;
}

// Rozpracovaná pozice taženého pruhu (ADR-005: command jde na server až při
// mouseup, do té doby si Gantt drží náhled lokálně, mimo `tasks`).
export interface DragPreview {
  s: number;
  e: number;
  p: string;
}

// ── Tooltip State ──────────────────────────────────────────────────────────────

export interface TooltipState {
  task: Task;
  x: number;
  y: number;
}

// ── File Types ────────────────────────────────────────────────────────────────

// Metadata přílohy — obsah souboru žije v tabulce `files` na serveru, ne ve
// stavu projektu (ADR-010). `data` (base64) tu záměrně není: BLOB se stahuje
// zvlášť přes `GET /api/files/{id}` (`src/api/filesApi.ts`).
export interface FileRef {
  id: string;
  name: string;
  mimeType: string;
  size: number; // bytes
  addedAt: string;
  addedBy: string;
  note: string;
}

// ── View Types ─────────────────────────────────────────────────────────────────

export type ViewType =
  | 'projekt'
  | 'gantt'
  | 'seznam'
  | 'kapacita'
  | 'rizika'
  | 'soubory'
  | 'todo'
  | 'kb'
  | 'ado';

// ── TODO Types ────────────────────────────────────────────────────────────────

export type RecurrenceType = 'weekly' | 'biweekly' | 'monthly';

export interface RecurringReminder {
  id: string;
  title: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  recurrence: RecurrenceType;
  lastCompleted?: string; // YYYY-MM-DD
  enabled: boolean;
}

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

// ── Knowledge Base Types ──────────────────────────────────────────────────────

export interface KBPage {
  id: string;
  title: string;
  content: string; // Markdown
  createdAt: string;
  updatedAt: string;
  /**
   * Volné štítky pro filtrování. Plochý seznam stránek se nad pár desítkami
   * neudrží; strom by byl pro znalostní bázi zbytečně tuhý (knowledge-base.feature).
   */
  tags?: string[];
}

// ── Severity Config ────────────────────────────────────────────────────────────

export interface SeverityConfig {
  bg: string;
  bd: string;
  tx: string;
  label: string;
}

export type SeverityConfigMap = Record<Severity, SeverityConfig>;

// ── ADO Sync Types ────────────────────────────────────────────────────────────

export interface ADOMemberMapping {
  plannerId: string; // ID osoby v plánovači
  adoIdentity: string | null; // Email v ADO
  adoDisplayName: string | null;
}

export interface ADOConfig {
  orgUrl: string; // https://dev.azure.com/org
  project: string; // Název ADO projektu
  areaPath: string; // Cesta pro Coverage gap, např. NPEZ\RP04
  trackedWiTypes: string[]; // Typy WI pro Coverage gap
  defaultPushWiType: string; // Typ WI pro push (např. Product Backlog Item)
  defaultIteration: string; // Výchozí iterace pro push
  mdToHoursCoefficient: number; // 1 MD = X hodin (výchozí 8)
  includePATInExport: boolean; // Zahrnout PAT do JSON exportu
  memberMapping: ADOMemberMapping[];
}

export type ADOSyncAction =
  | 'ACKNOWLEDGED'
  | 'ADDED_TO_PLAN'
  | 'PUSHED_TO_ADO'
  | 'DESC_SYNC_TO_ADO'
  | 'DESC_SYNC_FROM_ADO'
  | 'DESC_SYNC_BOTH'
  | 'IGNORED'
  | 'LINKED'
  | 'MD_ADDED';

export interface ADOSyncLogEntry {
  id: string;
  timestamp: string;
  action: ADOSyncAction;
  taskId?: string;
  taskName?: string;
  wiId?: number;
  wiTitle?: string;
  details: string;
}

// ── ADO Work Item Types (pro API responses) ───────────────────────────────────

export interface ADOWorkItem {
  id: number;
  url: string;
  fields: {
    'System.Title': string;
    'System.State': string;
    'System.WorkItemType': string;
    'System.AssignedTo'?: {
      displayName: string;
      uniqueName: string;
    };
    'System.Description'?: string;
    'System.AreaPath'?: string;
    'System.IterationPath'?: string;
    'Microsoft.VSTS.Scheduling.RemainingWork'?: number;
    'Microsoft.VSTS.Common.Severity'?: string;
    'System.ChangedDate'?: string;
  };
  relations?: Array<{
    rel: string;
    url: string;
    attributes: { name?: string };
  }>;
}

/**
 * Work item ve tvaru, v jakém ho posílá server (`AdoWorkItemView` v
 * `Domain/Ado.fs`). Oproti `ADOWorkItem` (syrová odpověď REST API) je popis
 * **už převedený na markdown na serveru** — kdyby si ho klient konvertoval
 * sám, mohl by dojít k jinému výsledku než porovnání v `detectChanges` a UI by
 * hlásilo falešné rozdíly (ADR-008).
 */
export interface ADOWorkItemView {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string | null;
  assignedToEmail: string | null;
  areaPath: string;
  iterationPath: string;
  remainingWork?: number;
  descriptionMd: string;
}

/**
 * Uživatelská rozhodnutí ze snapshotu — co už uživatel odklikl. Bez nich by se
 * mu při každém syncu vynořilo znovu všechno potvrzené i ignorované.
 */
export interface ADODecisions {
  ignoredGapIds: number[];
  /** Klíč je `"{wiId}-{typ změny}"` — stejně jako `changeKey` na serveru. */
  acknowledgedChanges: string[];
  ignoredUnlinkedTaskIds: string[];
}

/** Doprovodná data výsledku syncu (`AdoSyncContext` na serveru). */
export interface ADOSyncContext {
  workItems: ADOWorkItemView[];
  lastSync: string;
  decisions: ADODecisions;
}

/** Data pro založení nového work itemu z úkolu (FR-ADO-08). Popis jde jako markdown. */
export interface ADOWorkItemDraft {
  wiType: string;
  title: string;
  descriptionMd: string;
  areaPath: string;
  iterationPath: string;
  assignedTo: string;
  remainingWork: number;
}

/** Co se přebírá z ADO do plánovače (FR-ADO-06). */
export type ADOAcceptField = 'state' | 'assignee' | 'description';

export interface ADOSnapshotItem {
  state: string;
  remainingWork: number | null;
  assignedTo: string | null;
  descriptionHash: string;
  workItemType: string;
  title: string;
}

export interface ADOSnapshot {
  lastSync: string;
  items: Record<number, ADOSnapshotItem>;
  // Persisted ignored/acknowledged state
  ignoredGapIds?: number[];
  acknowledgedChanges?: string[]; // Format: "wiId-changeType"
  ignoredUnlinkedTaskIds?: string[]; // Task IDs without ADO link that user chose to ignore
}

export type WIChangeType =
  | 'state_regression'
  | 'new_bug_child'
  | 'remaining_increase'
  | 'remaining_decrease'
  | 'state_resolved'
  | 'assignee_change'
  | 'description_change'
  // Planner → ADO direction
  | 'planner_assignment_differs' // Task person differs from ADO AssignedTo
  | 'planner_completed_not_ado'; // Task is 100% but WI not resolved

export type WIChangeSeverity = 'high' | 'medium' | 'info' | 'sync';

export type WIChangeDirection = 'ado_to_planner' | 'planner_to_ado';

export interface WIChange {
  type: WIChangeType;
  severity: WIChangeSeverity;
  direction?: WIChangeDirection;
  wiId: number;
  wiTitle: string;
  taskId: string;
  taskName: string;
  details: string;
  oldValue?: string | number | null;
  newValue?: string | number | null;
}
