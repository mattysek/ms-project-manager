// Detekce konfliktů mezi offline pending commandy a stavem na serveru.
//
// ADR-009, sekce „Conflict Detection" + PRD-05, FR-OFFLINE-06: konflikt
// nastane, pokud server v mezičase změnil STEJNÉ pole STEJNÉ entity, na
// kterou míří nepřehraný pending command. Detekce porovnává:
//   - `serverState`         — čerstvý `full_state` po reconnectu
//   - `stateBeforeOffline`  — cache stavu z okamžiku, kdy klient přišel o spojení
// Pokud se hodnota pole mezi nimi liší, znamená to, že ji změnil NĚKDO JINÝ,
// zatímco byl tento klient offline → konflikt s jeho pending commandem.
//
// Čistá funkce bez side-efektů — UI conflict resolution dialog (FR-OFFLINE-06)
// je navazující krok, tady je jen samotná detekční logika.
import type { AppState } from './appState';
import type { PendingCommand } from '../storage/offlineQueue';
import type { KBPage, Opportunity, Person, Project, Risk, Task } from '../types';

export interface Conflict {
  pending: PendingCommand;
  entityId: string;
  entityLabel: string;
  fieldLabel: string;
  serverValue: unknown;
  pendingValue: unknown;
}

function findById<T extends { id: string }>(list: T[], id: string): T | undefined {
  return list.find((item) => item.id === id);
}

/** Porovnání hodnot polí — pole/objekty (weekAlloc, checkItems, …) srovnáváme podle obsahu. */
function valuesDiffer(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

interface SingleFieldProbe<T extends { id: string }> {
  serverList: T[];
  beforeList: T[];
  entityId: string;
  fieldLabel: string;
  extractValue: (entity: T) => unknown;
  pendingValue: unknown;
  labelFor: (entity: T) => string;
}

/** Konflikt na jednom konkrétním poli (např. `move_task`, `update_progress`). */
/**
 * Entita, kterou někdo mezitím smazal.
 *
 * Bez tohohle případu se offline úprava smazaného úkolu neohlásila vůbec:
 * command se přehrál, server odpověděl „Úkol neexistuje" a uživatel místo
 * volby dostal chybovou hlášku. Konflikt to přitom je — jen se serverovou
 * hodnotou „smazáno".
 */
function deletedEntityConflict(
  pending: PendingCommand,
  entityId: string,
  entityLabel: string,
  pendingValue: unknown
): Conflict {
  return {
    pending,
    entityId,
    entityLabel,
    fieldLabel: 'Existence entity',
    serverValue: 'smazáno jiným uživatelem',
    pendingValue,
  };
}

function singleFieldConflict<T extends { id: string }>(
  pending: PendingCommand,
  probe: SingleFieldProbe<T>
): Conflict | null {
  const serverEntity = findById(probe.serverList, probe.entityId);
  const beforeEntity = findById(probe.beforeList, probe.entityId);
  if (!serverEntity && beforeEntity) {
    return deletedEntityConflict(
      pending,
      probe.entityId,
      probe.labelFor(beforeEntity),
      probe.pendingValue
    );
  }
  if (!serverEntity || !beforeEntity) return null;

  const serverValue = probe.extractValue(serverEntity);
  const beforeValue = probe.extractValue(beforeEntity);
  if (!valuesDiffer(serverValue, beforeValue)) return null;

  return {
    pending,
    entityId: probe.entityId,
    entityLabel: probe.labelFor(serverEntity),
    fieldLabel: probe.fieldLabel,
    serverValue,
    pendingValue: probe.pendingValue,
  };
}

interface FieldsProbe<T extends { id: string }> {
  serverList: T[];
  beforeList: T[];
  entityId: string;
  fields: Partial<T>;
  labelFor: (entity: T) => string;
}

/** Konflikt na libovolném z polí `update_*` commandu — jeden `Conflict` per změněné pole. */
function updateFieldsConflicts<T extends { id: string }>(
  pending: PendingCommand,
  probe: FieldsProbe<T>
): Conflict[] {
  const serverEntity = findById(probe.serverList, probe.entityId);
  const beforeEntity = findById(probe.beforeList, probe.entityId);
  if (!serverEntity && beforeEntity) {
    return [
      deletedEntityConflict(pending, probe.entityId, probe.labelFor(beforeEntity), probe.fields),
    ];
  }
  if (!serverEntity || !beforeEntity) return [];

  const changedFields = (Object.keys(probe.fields) as (keyof T)[]).filter((field) =>
    valuesDiffer(serverEntity[field], beforeEntity[field])
  );

  return changedFields.map((field) => ({
    pending,
    entityId: probe.entityId,
    entityLabel: probe.labelFor(serverEntity),
    fieldLabel: String(field),
    serverValue: serverEntity[field],
    pendingValue: probe.fields[field],
  }));
}

// ── Doménové detektory ───────────────────────────────────────────────────────

function detectTaskConflicts(
  pending: PendingCommand,
  state: AppState,
  before: AppState
): Conflict[] {
  const cmd = pending.command;
  const labelFor = (t: Task) => t.name;

  if (cmd.type === 'move_task') {
    const conflict = singleFieldConflict(pending, {
      serverList: state.tasks,
      beforeList: before.tasks,
      entityId: cmd.taskId,
      fieldLabel: 'Pozice úkolu (start a konec týdne)',
      extractValue: (t) => `W${t.s + 1}-W${t.e + 1}`,
      pendingValue: `W${cmd.s + 1}-W${cmd.e + 1}`,
      labelFor,
    });
    return conflict ? [conflict] : [];
  }
  if (cmd.type === 'update_progress') {
    const conflict = singleFieldConflict(pending, {
      serverList: state.tasks,
      beforeList: before.tasks,
      entityId: cmd.taskId,
      fieldLabel: 'Progress (%)',
      extractValue: (t) => t.progress,
      pendingValue: cmd.progress,
      labelFor,
    });
    return conflict ? [conflict] : [];
  }
  if (cmd.type === 'update_task') {
    return updateFieldsConflicts(pending, {
      serverList: state.tasks,
      beforeList: before.tasks,
      entityId: cmd.taskId,
      fields: cmd.fields,
      labelFor,
    });
  }
  return [];
}

function detectPersonConflicts(
  pending: PendingCommand,
  state: AppState,
  before: AppState
): Conflict[] {
  const cmd = pending.command;
  const labelFor = (p: Person) => p.name;

  if (cmd.type === 'update_alloc') {
    const conflict = singleFieldConflict(pending, {
      serverList: state.people,
      beforeList: before.people,
      entityId: cmd.personId,
      fieldLabel: `Alokace — týden ${cmd.weekIdx + 1}`,
      extractValue: (p) => p.weekAlloc[cmd.weekIdx] ?? 0,
      pendingValue: cmd.pct,
      labelFor,
    });
    return conflict ? [conflict] : [];
  }
  if (cmd.type === 'update_person') {
    return updateFieldsConflicts(pending, {
      serverList: state.people,
      beforeList: before.people,
      entityId: cmd.personId,
      fields: cmd.fields,
      labelFor,
    });
  }
  return [];
}

function detectRiskConflicts(
  pending: PendingCommand,
  state: AppState,
  before: AppState
): Conflict[] {
  const cmd = pending.command;
  if (cmd.type !== 'update_risk') return [];
  return updateFieldsConflicts(pending, {
    serverList: state.risks,
    beforeList: before.risks,
    entityId: cmd.riskId,
    fields: cmd.fields,
    labelFor: (r: Risk) => r.title,
  });
}

function detectOpportunityConflicts(
  pending: PendingCommand,
  state: AppState,
  before: AppState
): Conflict[] {
  const cmd = pending.command;
  if (cmd.type !== 'update_opportunity') return [];
  return updateFieldsConflicts(pending, {
    serverList: state.opps,
    beforeList: before.opps,
    entityId: cmd.oppId,
    fields: cmd.fields,
    labelFor: (o: Opportunity) => o.title,
  });
}

function detectKbConflicts(pending: PendingCommand, state: AppState, before: AppState): Conflict[] {
  const cmd = pending.command;
  if (cmd.type !== 'update_kb_page') return [];
  return updateFieldsConflicts(pending, {
    serverList: state.kbPages,
    beforeList: before.kbPages,
    entityId: cmd.pageId,
    fields: cmd.fields,
    labelFor: (p: KBPage) => p.title,
  });
}

/** `Project` není keyed record, takže nejde přes `updateFieldsConflicts`/`findById`. */
function detectProjectConflicts(
  pending: PendingCommand,
  state: AppState,
  before: AppState
): Conflict[] {
  const cmd = pending.command;
  if (cmd.type !== 'update_project') return [];

  const changedFields = (Object.keys(cmd.fields) as (keyof Project)[]).filter((field) =>
    valuesDiffer(state.project[field], before.project[field])
  );

  return changedFields.map((field) => ({
    pending,
    entityId: 'project',
    entityLabel: 'Projekt',
    fieldLabel: String(field),
    serverValue: state.project[field],
    pendingValue: cmd.fields[field],
  }));
}

// ── Vstupní bod ────────────────────────────────────────────────────────────

function detectCommandConflicts(
  pending: PendingCommand,
  state: AppState,
  before: AppState
): Conflict[] {
  return [
    ...detectTaskConflicts(pending, state, before),
    ...detectPersonConflicts(pending, state, before),
    ...detectRiskConflicts(pending, state, before),
    ...detectOpportunityConflicts(pending, state, before),
    ...detectKbConflicts(pending, state, before),
    ...detectProjectConflicts(pending, state, before),
  ];
}

/**
 * Vrátí konflikty mezi nepřehranými pending commandy a stavem, který mezitím
 * poslal server. Prázdné pole = bezpečné přehrát všechny commandy sekvenčně
 * (ADR-009, „Reconnect Replay").
 */
export function detectConflicts(
  pending: PendingCommand[],
  serverState: AppState,
  stateBeforeOffline: AppState
): Conflict[] {
  return pending.flatMap((p) => detectCommandConflicts(p, serverState, stateBeforeOffline));
}
