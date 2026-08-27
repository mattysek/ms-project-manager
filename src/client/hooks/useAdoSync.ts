// Stavová vrstva Azure DevOps synchronizace — PRD-06, ADR-008.
//
// Po ADR-008 klient na ADO REST API nesahá: pošle command, server s uloženým
// (šifrovaným) PATem zavolá ADO a výsledek vrátí jako diff. Tenhle hook je
// klientská polovina té výměny — posílá ADO commandy a konzumuje ADO diffy.
//
// **Co drží mimo `AppState`** (ADR-004 doplněk, „Stav mimo AppState"):
//  - `patStatus` — `patSet`/`patUpdatedAt`. Stav PATu je per-user, kdežto
//    `adoConfig` je sdílený; samotný PAT se ke klientovi nikdy nevrátí, takže
//    tenhle hook (ani nic jiného na klientovi) ho v žádném tvaru nedrží.
//  - `connectionTest` — jednorázový výsledek „Ověřit připojení" (FR-ADO-03).
//  - `progress` / `syncing` — průběh běžící operace, ne data projektu.
//  - `result` + `decisions` — výsledek posledního syncu; je vázaný na běh, ne
//    na projekt, a do undo/redo historie ani do persistovaného stavu nepatří.
//
// Do `AppState` se z ADO promítá jen `adoConfig` a `adoSyncLog` — to obstarává
// `applyDiff`, ne tenhle hook.
//
// **Rozhodnutí uživatele jsou optimistická.** Server u `ado_acknowledge_change`,
// `ado_ignore_gap` a `ado_ignore_unlinked_task` zapíše rozhodnutí do snapshotu
// a **žádný diff nepošle** (`updateDecisions` v `AdoBridgeContext`). Kdyby si
// klient rozhodnutí nedržel sám, potvrzená změna by ze seznamu nezmizela až do
// dalšího syncu. Coverage gap navíc server nefiltruje vůbec — `visibleGaps` je
// jediné místo, kde se ignorované WI odfiltrují (FR-ADO-09).
//
// Testovatelnost bez serveru: hook nemá vlastní transport ani spojení —
// `dispatch` dostane zvenku a diffy mu volající předává přes `handleDiff`
// (typicky napojené na `useProjectChannel` `options.onDiff`). Stejný záměr jako
// injektovatelný `createTransport` v `useProjectChannel`.
import { useCallback, useMemo, useState } from 'react';
import type {
  ADOAcceptField,
  ADOConfig,
  ADODecisions,
  ADOSyncLogEntry,
  ADOWorkItemDraft,
  ADOWorkItemView,
  Task,
  WIChange,
  WIChangeType,
} from '../types';
import type { ProjectCommand, ProjectDiff } from '../types/protocol';

// ── Tvary vystavené UI ──────────────────────────────────────────────────────

/** Stav PATu tak, jak ho klient smí znát (FR-ADO-02) — bez hodnoty tokenu. */
export interface AdoPatStatus {
  patSet: boolean;
  patUpdatedAt: string | null;
}

export interface AdoConnectionTest {
  ok: boolean;
  message: string;
}

/** Průběh běžícího syncu (FR-ADO-04, „Stahuji work items… (42/87)"). */
export interface AdoSyncProgress {
  phase: string;
  completed: number;
  total: number;
}

/** Výsledek posledního syncu. `workItems` je zdroj pro detail a diff popisu. */
export interface AdoSyncResult {
  changes: WIChange[];
  gaps: ADOWorkItemView[];
  workItems: ADOWorkItemView[];
  lastSync: string;
}

export interface AdoAcceptFromAdoArgs {
  wiId: number;
  taskId: string;
  field: ADOAcceptField;
  /** Sloučený popis při obousměrném merge; chybí-li, vezme se popis z ADO. */
  text?: string;
}

export interface AdoPushDescriptionArgs {
  wiId: number;
  taskId: string;
  text: string;
  /** Merge obousměrně — popis se uloží i na úkol v plánovači. */
  alsoPlanner: boolean;
}

export interface AdoSyncCommands {
  saveConfig: (config: ADOConfig) => void;
  savePat: (pat: string) => void;
  deletePat: () => void;
  testConnection: () => void;
  runSync: () => void;
  acknowledgeChange: (wiId: number, changeType: WIChangeType, acknowledged: boolean) => void;
  ignoreGap: (wiId: number, ignored: boolean) => void;
  ignoreUnlinkedTask: (taskId: string, ignored: boolean) => void;
  acceptFromAdo: (args: AdoAcceptFromAdoArgs) => void;
  pushAssignee: (wiId: number, taskId: string) => void;
  pushState: (wiId: number, taskId: string, state: string) => void;
  pushDescription: (args: AdoPushDescriptionArgs) => void;
  createWorkItem: (taskId: string, draft: ADOWorkItemDraft) => void;
  addGapToPlan: (wiId: number, task: Task) => void;
  linkGapToTask: (wiId: number, taskId: string) => void;
}

/** Stav hooku pohromadě — jeden `useState`, aby redukce diffů byla čistá funkce. */
export interface AdoSyncState {
  patStatus: AdoPatStatus;
  connectionTest: AdoConnectionTest | null;
  progress: AdoSyncProgress | null;
  syncing: boolean;
  result: AdoSyncResult | null;
  decisions: ADODecisions;
  /** Poslední přírůstek sync logu — pro potvrzovací hlášku po akci (FR-ADO-10). */
  lastLogEntry: ADOSyncLogEntry | null;
}

export interface UseAdoSyncResult extends AdoSyncState {
  /** Změny bez těch, které už uživatel odklikl (FR-ADO-06). */
  visibleChanges: WIChange[];
  /** Coverage gap bez ignorovaných work itemů (FR-ADO-09). */
  visibleGaps: ADOWorkItemView[];
  handleDiff: (diff: ProjectDiff) => void;
  commands: AdoSyncCommands;
}

type Dispatch = (command: ProjectCommand) => void;
type DecisionUpdater = (change: (decisions: ADODecisions) => ADODecisions) => void;

// ── Pomocné funkce ──────────────────────────────────────────────────────────

const EMPTY_DECISIONS: ADODecisions = {
  ignoredGapIds: [],
  acknowledgedChanges: [],
  ignoredUnlinkedTaskIds: [],
};

const INITIAL_STATE: AdoSyncState = {
  patStatus: { patSet: false, patUpdatedAt: null },
  connectionTest: null,
  progress: null,
  syncing: false,
  result: null,
  decisions: EMPTY_DECISIONS,
  lastLogEntry: null,
};

/**
 * Klíč rozhodnutí nad změnou. Musí se **doslova** shodovat se serverovým
 * `changeKey` (`Domain/Ado.fs`), jinak by si obě strany filtrovaly podle
 * jiného klíče a potvrzené změny by se vracely.
 */
function changeKey(wiId: number, changeType: WIChangeType): string {
  return `${wiId}-${changeType}`;
}

/** Zapne/vypne položku v seznamu rozhodnutí — obdoba `toggle` na serveru. */
function toggle<T>(list: T[], value: T, active: boolean): T[] {
  const without = list.filter((item) => item !== value);
  return active ? [...without, value] : without;
}

function patStatusOf(diff: { patSet: boolean; patUpdatedAt?: string | null }): AdoPatStatus {
  return { patSet: diff.patSet, patUpdatedAt: diff.patUpdatedAt ?? null };
}

function syncCompleted(
  state: AdoSyncState,
  diff: Extract<ProjectDiff, { op: 'ado_sync_completed' }>
): AdoSyncState {
  return {
    ...state,
    syncing: false,
    progress: null,
    result: {
      changes: diff.changes,
      gaps: diff.gaps,
      workItems: diff.context.workItems,
      lastSync: diff.context.lastSync,
    },
    // Rozhodnutí jsou autoritativně ve snapshotu na serveru — čerstvý sync je
    // přebije, včetně těch, která mezitím udělal jiný PM.
    decisions: diff.context.decisions,
  };
}

/**
 * Čistá redukce ADO diffu do stavu hooku. Diffy, které se ADO netýkají, vrací
 * stav beze změny — `handleDiff` je napojené na proud VŠECH diffů.
 */
export function reduceAdoDiff(state: AdoSyncState, diff: ProjectDiff): AdoSyncState {
  switch (diff.op) {
    case 'ado_config_updated':
    case 'ado_pat_saved':
      return { ...state, patStatus: patStatusOf(diff) };
    case 'ado_connection_tested':
      return { ...state, connectionTest: { ok: diff.ok, message: diff.message } };
    case 'ado_sync_progress':
      return {
        ...state,
        syncing: true,
        progress: { phase: diff.phase, completed: diff.completed, total: diff.total },
      };
    case 'ado_sync_completed':
      return syncCompleted(state, diff);
    case 'ado_sync_log_appended':
      return { ...state, lastLogEntry: diff.entry };
    // Chyba syncu nedorazí jako `ado_sync_completed`, takže bez tohohle by
    // indikátor „synchronizuji…" zůstal viset navždy.
    case 'error':
      return diff.commandType === 'ado_run_sync'
        ? { ...state, syncing: false, progress: null }
        : state;
    default:
      return state;
  }
}

function visibleChangesOf(result: AdoSyncResult | null, decisions: ADODecisions): WIChange[] {
  if (!result) return [];
  const acknowledged = new Set(decisions.acknowledgedChanges);
  return result.changes.filter((change) => !acknowledged.has(changeKey(change.wiId, change.type)));
}

function visibleGapsOf(result: AdoSyncResult | null, decisions: ADODecisions): ADOWorkItemView[] {
  if (!result) return [];
  const ignored = new Set(decisions.ignoredGapIds);
  return result.gaps.filter((gap) => !ignored.has(gap.id));
}

// ── Skupiny commandů ────────────────────────────────────────────────────────

/** Konfigurace, PAT a ověření připojení (FR-ADO-01 až 03). */
function useSetupCommands(dispatch: Dispatch) {
  return useMemo(
    () => ({
      saveConfig: (config: ADOConfig) => dispatch({ type: 'ado_save_config', config }),
      savePat: (pat: string) => dispatch({ type: 'ado_save_pat', pat }),
      deletePat: () => dispatch({ type: 'ado_delete_pat' }),
      testConnection: () => dispatch({ type: 'ado_test_connection' }),
    }),
    [dispatch]
  );
}

/** Rozhodnutí uživatele — server je jen zapíše do snapshotu, diff nepošle. */
function useDecisionCommands(dispatch: Dispatch, updateDecisions: DecisionUpdater) {
  return useMemo(
    () => ({
      acknowledgeChange: (wiId: number, changeType: WIChangeType, acknowledged: boolean) => {
        dispatch({ type: 'ado_acknowledge_change', wiId, changeType, acknowledged });
        updateDecisions((decisions) => ({
          ...decisions,
          acknowledgedChanges: toggle(
            decisions.acknowledgedChanges,
            changeKey(wiId, changeType),
            acknowledged
          ),
        }));
      },
      ignoreGap: (wiId: number, ignored: boolean) => {
        dispatch({ type: 'ado_ignore_gap', wiId, ignored });
        updateDecisions((decisions) => ({
          ...decisions,
          ignoredGapIds: toggle(decisions.ignoredGapIds, wiId, ignored),
        }));
      },
      ignoreUnlinkedTask: (taskId: string, ignored: boolean) => {
        dispatch({ type: 'ado_ignore_unlinked_task', taskId, ignored });
        updateDecisions((decisions) => ({
          ...decisions,
          ignoredUnlinkedTaskIds: toggle(decisions.ignoredUnlinkedTaskIds, taskId, ignored),
        }));
      },
    }),
    [dispatch, updateDecisions]
  );
}

/** Akce nad výsledkem syncu — všechny končí voláním ADO API na serveru. */
function useActionCommands(dispatch: Dispatch) {
  return useMemo(
    () => ({
      acceptFromAdo: ({ wiId, taskId, field, text }: AdoAcceptFromAdoArgs) =>
        dispatch({ type: 'ado_accept_from_ado', wiId, taskId, field, text }),
      pushAssignee: (wiId: number, taskId: string) =>
        dispatch({ type: 'ado_push_assignee', wiId, taskId }),
      pushState: (wiId: number, taskId: string, state: string) =>
        dispatch({ type: 'ado_push_state', wiId, taskId, state }),
      pushDescription: ({ wiId, taskId, text, alsoPlanner }: AdoPushDescriptionArgs) =>
        dispatch({ type: 'ado_push_description', wiId, taskId, text, alsoPlanner }),
      createWorkItem: (taskId: string, draft: ADOWorkItemDraft) =>
        dispatch({ type: 'ado_create_work_item', taskId, draft }),
      addGapToPlan: (wiId: number, task: Task) =>
        dispatch({ type: 'ado_add_gap_to_plan', wiId, task }),
      linkGapToTask: (wiId: number, taskId: string) =>
        dispatch({ type: 'ado_link_gap_to_task', wiId, taskId }),
    }),
    [dispatch]
  );
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useAdoSync(dispatch: Dispatch): UseAdoSyncResult {
  const [state, setState] = useState<AdoSyncState>(INITIAL_STATE);

  const handleDiff = useCallback((diff: ProjectDiff) => {
    setState((prev) => reduceAdoDiff(prev, diff));
  }, []);

  const updateDecisions = useCallback<DecisionUpdater>((change) => {
    setState((prev) => ({ ...prev, decisions: change(prev.decisions) }));
  }, []);

  // `syncing` se zapíná už při odeslání commandu, ne až prvním
  // `ado_sync_progress` — mezi klikem a první zprávou ze serveru je round-trip,
  // po který by tlačítko zůstalo aktivní a šlo by sync spustit dvakrát.
  const runSync = useCallback(() => {
    setState((prev) => ({ ...prev, syncing: true, progress: null }));
    dispatch({ type: 'ado_run_sync' });
  }, [dispatch]);

  const setup = useSetupCommands(dispatch);
  const decisions = useDecisionCommands(dispatch, updateDecisions);
  const actions = useActionCommands(dispatch);

  const commands = useMemo(
    () => ({ ...setup, ...decisions, ...actions, runSync }),
    [setup, decisions, actions, runSync]
  );

  const visibleChanges = useMemo(
    () => visibleChangesOf(state.result, state.decisions),
    [state.result, state.decisions]
  );
  const visibleGaps = useMemo(
    () => visibleGapsOf(state.result, state.decisions),
    [state.result, state.decisions]
  );

  return useMemo(
    () => ({ ...state, visibleChanges, visibleGaps, handleDiff, commands }),
    [state, visibleChanges, visibleGaps, handleDiff, commands]
  );
}
