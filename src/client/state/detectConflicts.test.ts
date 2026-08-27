// Testy detectConflicts — čistá detekce konfliktů pending commandů vs. server (ADR-009, FR-OFFLINE-06).
import { describe, expect, it } from 'vitest';
import { detectConflicts } from './detectConflicts';
import { makeAppState, makeTask, makePerson, makeRisk } from './testFixtures';
import type { PendingCommand } from '../storage/offlineQueue';
import type { ProjectCommand } from '../types/protocol';

function makePending(
  command: ProjectCommand,
  overrides: Partial<PendingCommand> = {}
): PendingCommand {
  return {
    id: 'pc1',
    projectId: 'proj1',
    command,
    timestamp: '2026-01-05T10:00:00.000Z',
    locallyApplied: true,
    ...overrides,
  };
}

describe('detectConflicts — move_task (offline.feature / real-time-collaboration.feature)', () => {
  // @scenario: offline.feature > Seamless synchronizace při reconnectu bez konfliktů
  it('žádný konflikt, pokud server úkol mezitím nezměnil', () => {
    const task = makeTask({ id: 't1', s: 0, e: 3 });
    const stateBeforeOffline = makeAppState({ tasks: [task] });
    const serverState = makeAppState({ tasks: [task] }); // server nezměnil nic
    const pending = [makePending({ type: 'move_task', taskId: 't1', s: 2, e: 5 })];

    expect(detectConflicts(pending, serverState, stateBeforeOffline)).toEqual([]);
  });

  // @scenario: offline.feature > Conflict resolution dialog při reconnectu
  it('konflikt, pokud server přesunul stejný úkol jinam', () => {
    const beforeTask = makeTask({ id: 't1', s: 0, e: 3 });
    const serverTask = makeTask({ id: 't1', s: 1, e: 2 }); // "petra.kolarova" přesunula na W2-W3
    const stateBeforeOffline = makeAppState({ tasks: [beforeTask] });
    const serverState = makeAppState({ tasks: [serverTask] });
    const pending = [makePending({ type: 'move_task', taskId: 't1', s: 4, e: 7 })]; // "jan.novak" na W5-W8

    const conflicts = detectConflicts(pending, serverState, stateBeforeOffline);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      entityId: 't1',
      entityLabel: beforeTask.name,
      fieldLabel: 'Pozice úkolu (start a konec týdne)',
      serverValue: 'W2-W3',
      pendingValue: 'W5-W8',
    });
  });

  // Dřív se tenhle případ za konflikt nepovažoval: command se přehrál, server
  // odpověděl „Úkol neexistuje" a uživatel místo volby dostal chybovou hlášku,
  // takže o offline práci tiše přišel. Smazání je konflikt jako každý jiný.
  it('smazání entity serverem je konflikt, ne tichý propad', () => {
    const task = makeTask({ id: 't1', name: 'API refaktoring', s: 0, e: 3 });
    const stateBeforeOffline = makeAppState({ tasks: [task] });
    const serverState = makeAppState({ tasks: [] });
    const pending = [makePending({ type: 'move_task', taskId: 't1', s: 2, e: 5 })];

    const conflicts = detectConflicts(pending, serverState, stateBeforeOffline);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entityLabel).toBe('API refaktoring');
    expect(conflicts[0]?.serverValue).toBe('smazáno jiným uživatelem');
  });

  it('neznámá entita bez historie konflikt nehlásí', () => {
    const stateBeforeOffline = makeAppState({ tasks: [] });
    const serverState = makeAppState({ tasks: [] });
    const pending = [makePending({ type: 'move_task', taskId: 't-neznámý', s: 2, e: 5 })];

    expect(detectConflicts(pending, serverState, stateBeforeOffline)).toEqual([]);
  });
});

describe('detectConflicts — ostatní commandy', () => {
  it('update_progress hlásí konflikt, pokud server progress mezitím změnil', () => {
    const before = makeTask({ id: 't1', progress: 10 });
    const server = makeTask({ id: 't1', progress: 40 });
    const state = makeAppState({ tasks: [before] });
    const serverState = makeAppState({ tasks: [server] });
    const pending = [makePending({ type: 'update_progress', taskId: 't1', progress: 90 })];

    const conflicts = detectConflicts(pending, serverState, state);

    expect(conflicts).toEqual([
      {
        pending: pending[0],
        entityId: 't1',
        entityLabel: before.name,
        fieldLabel: 'Progress (%)',
        serverValue: 40,
        pendingValue: 90,
      },
    ]);
  });

  it('update_task vrátí jeden konflikt per změněné pole, nezměněná pole vynechá', () => {
    const before = makeTask({ id: 't1', name: 'Staré', md: 5 });
    const server = makeTask({ id: 't1', name: 'Přejmenováno serverem', md: 5 });
    const state = makeAppState({ tasks: [before] });
    const serverState = makeAppState({ tasks: [server] });
    const pending = [
      makePending({ type: 'update_task', taskId: 't1', fields: { name: 'Moje jméno', md: 8 } }),
    ];

    const conflicts = detectConflicts(pending, serverState, state);

    expect(conflicts).toEqual([
      {
        pending: pending[0],
        entityId: 't1',
        entityLabel: server.name,
        fieldLabel: 'name',
        serverValue: 'Přejmenováno serverem',
        pendingValue: 'Moje jméno',
      },
    ]);
  });

  it('update_alloc hlásí konflikt jen pro dotčený týden', () => {
    const before = makePerson({ id: 'p1', weekAlloc: [100, 50] });
    const server = makePerson({ id: 'p1', weekAlloc: [100, 80] });
    const state = makeAppState({ people: [before] });
    const serverState = makeAppState({ people: [server] });
    const pending = [makePending({ type: 'update_alloc', personId: 'p1', weekIdx: 1, pct: 30 })];

    const conflicts = detectConflicts(pending, serverState, state);

    expect(conflicts).toMatchObject([
      { fieldLabel: 'Alokace — týden 2', serverValue: 80, pendingValue: 30 },
    ]);
  });

  it('update_risk a update_project detekují konflikt stejným vzorem jako update_task', () => {
    const beforeRisk = makeRisk({ id: 'r1', sev: 'low' });
    const serverRisk = makeRisk({ id: 'r1', sev: 'high' });
    const state = makeAppState({ risks: [beforeRisk], tasks: [] });
    state.project.budget = 100;
    const serverState = makeAppState({ risks: [serverRisk], tasks: [] });
    serverState.project.budget = 250;
    const pending = [
      makePending({ type: 'update_risk', riskId: 'r1', fields: { sev: 'med' } }),
      makePending({ type: 'update_project', fields: { budget: 300 } }, { id: 'pc2' }),
    ];

    const conflicts = detectConflicts(pending, serverState, state);

    expect(conflicts).toHaveLength(2);
    expect(conflicts.find((c) => c.entityId === 'r1')).toMatchObject({
      serverValue: 'high',
      pendingValue: 'med',
    });
    expect(conflicts.find((c) => c.entityId === 'project')).toMatchObject({
      serverValue: 250,
      pendingValue: 300,
    });
  });

  it('žádný konflikt pro commandy bez doménového dopadu (undo, update_presence)', () => {
    const state = makeAppState();
    const pending = [
      makePending({ type: 'undo' }),
      makePending({ type: 'update_presence', view: 'gantt' }),
    ];

    expect(detectConflicts(pending, state, state)).toEqual([]);
  });
});
