// Testy invertCommand — inverze ProjectCommand pro per-session undo/redo (ADR-007).
import { describe, expect, it } from 'vitest';
import { invertCommand } from './invertCommand';
import type { ProjectCommand } from '../types/protocol';
import {
  makeAppState,
  makeTask,
  makePerson,
  makeRisk,
  makeOpportunity,
  makeKbPage,
  makeTodo,
  makeReminder,
} from './testFixtures';

describe('invertCommand — session commandy', () => {
  it('undo a redo nejsou invertovatelné', () => {
    const state = makeAppState();
    expect(invertCommand({ type: 'undo' }, state)).toBeNull();
    expect(invertCommand({ type: 'redo' }, state)).toBeNull();
  });

  it('update_presence není invertovatelné (session/UI stav, ne doménová data)', () => {
    const state = makeAppState();
    expect(invertCommand({ type: 'update_presence', view: 'gantt' }, state)).toBeNull();
  });
});

describe('invertCommand — import a Azure DevOps (doplněk ADR-004)', () => {
  it('full_state_import → full_state_import s prevState jako novým stavem', () => {
    const prevState = makeAppState();
    const importedState = makeAppState({ tasks: [] });

    const inverse = invertCommand({ type: 'full_state_import', state: importedState }, prevState);

    expect(inverse).toEqual({ type: 'full_state_import', state: prevState });
  });

  it('ado_save_config → ado_save_config s předchozí konfigurací', () => {
    const prevConfig = {
      orgUrl: 'https://dev.azure.com/org',
      project: 'NPEZ',
      areaPath: 'NPEZ\\RP04',
      trackedWiTypes: ['Bug'],
      defaultPushWiType: 'Product Backlog Item',
      defaultIteration: 'NPEZ\\Sprint 42',
      mdToHoursCoefficient: 8,
      includePATInExport: false,
      memberMapping: [],
    };
    const state = makeAppState({ adoConfig: prevConfig });
    const newConfig = { ...prevConfig, defaultIteration: 'NPEZ\\Sprint 43' };

    const inverse = invertCommand({ type: 'ado_save_config', config: newConfig }, state);

    expect(inverse).toEqual({ type: 'ado_save_config', config: prevConfig });
  });

  it('ado_save_config vrátí null, pokud předchozí konfigurace neexistovala', () => {
    const state = makeAppState({ adoConfig: null });
    const newConfig = {
      orgUrl: 'https://dev.azure.com/org',
      project: 'NPEZ',
      areaPath: '',
      trackedWiTypes: [],
      defaultPushWiType: 'Task',
      defaultIteration: '',
      mdToHoursCoefficient: 8,
      includePATInExport: false,
      memberMapping: [],
    };

    expect(invertCommand({ type: 'ado_save_config', config: newConfig }, state)).toBeNull();
  });

  it('PAT commandy nejsou invertovatelné — server hodnotu PAT klientovi nikdy nevrací', () => {
    const state = makeAppState();
    expect(invertCommand({ type: 'ado_save_pat', pat: 'secret' }, state)).toBeNull();
    expect(invertCommand({ type: 'ado_delete_pat' }, state)).toBeNull();
  });

  it('ado_test_connection a ado_run_sync jsou akční commandy bez inverze', () => {
    const state = makeAppState();
    expect(invertCommand({ type: 'ado_test_connection' }, state)).toBeNull();
    expect(invertCommand({ type: 'ado_run_sync' }, state)).toBeNull();
  });
});

describe('invertCommand — tasks (ADR-007 tabulka)', () => {
  it('add_task → delete_task', () => {
    const task = makeTask({ id: 't1' });
    const state = makeAppState({ tasks: [] });
    const cmd: ProjectCommand = { type: 'add_task', task };

    expect(invertCommand(cmd, state)).toEqual({ type: 'delete_task', taskId: 't1' });
  });

  it('delete_task → add_task se snapshotem smazaného úkolu z prevState', () => {
    const task = makeTask({ id: 't1', name: 'Smazaný úkol' });
    const state = makeAppState({ tasks: [task] });
    const cmd: ProjectCommand = { type: 'delete_task', taskId: 't1' };

    expect(invertCommand(cmd, state)).toEqual({ type: 'add_task', task });
  });

  it('delete_task vrátí null, pokud úkol v prevState není (nekonzistentní historie)', () => {
    const state = makeAppState({ tasks: [] });
    const cmd: ProjectCommand = { type: 'delete_task', taskId: 'neexistuje' };

    expect(invertCommand(cmd, state)).toBeNull();
  });

  it('move_task → move_task na předchozí s/e', () => {
    const task = makeTask({ id: 't1', s: 0, e: 3 });
    const state = makeAppState({ tasks: [task] });
    const cmd: ProjectCommand = { type: 'move_task', taskId: 't1', s: 5, e: 8 };

    expect(invertCommand(cmd, state)).toEqual({ type: 'move_task', taskId: 't1', s: 0, e: 3 });
  });

  it('update_progress → update_progress na předchozí hodnotu', () => {
    const task = makeTask({ id: 't1', progress: 20 });
    const state = makeAppState({ tasks: [task] });
    const cmd: ProjectCommand = { type: 'update_progress', taskId: 't1', progress: 75 };

    expect(invertCommand(cmd, state)).toEqual({
      type: 'update_progress',
      taskId: 't1',
      progress: 20,
    });
  });

  it('update_task → update_task jen s poli, která byla v původním commandu', () => {
    const task = makeTask({ id: 't1', name: 'Staré jméno', md: 5 });
    const state = makeAppState({ tasks: [task] });
    const cmd: ProjectCommand = {
      type: 'update_task',
      taskId: 't1',
      fields: { name: 'Nové jméno' },
    };

    expect(invertCommand(cmd, state)).toEqual({
      type: 'update_task',
      taskId: 't1',
      fields: { name: 'Staré jméno' },
    });
  });

  it('undo je opravdu symetrické: apply(cmd) pak apply(invert(cmd)) vrátí původní hodnotu', () => {
    const task = makeTask({ id: 't1', s: 1, e: 2 });
    const prevState = makeAppState({ tasks: [task] });
    const moveCmd: ProjectCommand = { type: 'move_task', taskId: 't1', s: 10, e: 12 };

    const inverse = invertCommand(moveCmd, prevState);

    expect(inverse).toEqual({ type: 'move_task', taskId: 't1', s: 1, e: 2 });
  });
});

describe('invertCommand — people', () => {
  it('add_person → delete_person', () => {
    const person = makePerson({ id: 'p1' });
    const state = makeAppState({ people: [] });

    expect(invertCommand({ type: 'add_person', person }, state)).toEqual({
      type: 'delete_person',
      personId: 'p1',
    });
  });

  it('delete_person → add_person se snapshotem', () => {
    const person = makePerson({ id: 'p1' });
    const state = makeAppState({ people: [person] });

    expect(invertCommand({ type: 'delete_person', personId: 'p1' }, state)).toEqual({
      type: 'add_person',
      person,
    });
  });

  it('update_person → update_person s předchozími poli', () => {
    const person = makePerson({ id: 'p1', name: 'Stará' });
    const state = makeAppState({ people: [person] });

    expect(
      invertCommand({ type: 'update_person', personId: 'p1', fields: { name: 'Nová' } }, state)
    ).toEqual({ type: 'update_person', personId: 'p1', fields: { name: 'Stará' } });
  });

  it('update_alloc → update_alloc s předchozím procentem pro daný týden (ADR-007 tabulka)', () => {
    const person = makePerson({ id: 'p1', weekAlloc: [100, 50, 0] });
    const state = makeAppState({ people: [person] });

    expect(
      invertCommand({ type: 'update_alloc', personId: 'p1', weekIdx: 1, pct: 80 }, state)
    ).toEqual({
      type: 'update_alloc',
      personId: 'p1',
      weekIdx: 1,
      pct: 50,
    });
  });

  it('update_alloc na neobsazený týden se vrátí na 0 %', () => {
    const person = makePerson({ id: 'p1', weekAlloc: [100] });
    const state = makeAppState({ people: [person] });

    expect(
      invertCommand({ type: 'update_alloc', personId: 'p1', weekIdx: 5, pct: 60 }, state)
    ).toEqual({
      type: 'update_alloc',
      personId: 'p1',
      weekIdx: 5,
      pct: 0,
    });
  });
});

describe('invertCommand — metadata projektu', () => {
  it('update_project → update_project s předchozími hodnotami dotčených polí', () => {
    const state = makeAppState();
    state.project.name = 'Původní název';

    const inverse = invertCommand(
      { type: 'update_project', fields: { name: 'Nový název' } },
      state
    );

    expect(inverse).toEqual({ type: 'update_project', fields: { name: 'Původní název' } });
  });

  it('set_milestones → set_milestones s předchozími milníky', () => {
    const state = makeAppState();
    state.project.milestones = [{ id: 'm1', title: 'Starý milník', weekIndex: 1, checkItems: [] }];

    const inverse = invertCommand(
      {
        type: 'set_milestones',
        milestones: [{ id: 'm2', title: 'Nový', weekIndex: 2, checkItems: [] }],
      },
      state
    );

    expect(inverse).toEqual({ type: 'set_milestones', milestones: state.project.milestones });
  });
});

describe('invertCommand — risks (ADR-007 tabulka)', () => {
  it('add_risk → delete_risk', () => {
    const risk = makeRisk({ id: 'r1' });
    const state = makeAppState({ risks: [] });

    expect(invertCommand({ type: 'add_risk', risk }, state)).toEqual({
      type: 'delete_risk',
      riskId: 'r1',
    });
  });

  it('update_risk → update_risk s předchozími poli', () => {
    const risk = makeRisk({ id: 'r1', sev: 'low' });
    const state = makeAppState({ risks: [risk] });

    expect(
      invertCommand({ type: 'update_risk', riskId: 'r1', fields: { sev: 'high' } }, state)
    ).toEqual({ type: 'update_risk', riskId: 'r1', fields: { sev: 'low' } });
  });

  it('delete_risk → add_risk se snapshotem', () => {
    const risk = makeRisk({ id: 'r1' });
    const state = makeAppState({ risks: [risk] });

    expect(invertCommand({ type: 'delete_risk', riskId: 'r1' }, state)).toEqual({
      type: 'add_risk',
      risk,
    });
  });
});

describe('invertCommand — opportunities', () => {
  it('add_opportunity → delete_opportunity a zpět', () => {
    const opp = makeOpportunity({ id: 'o1' });
    const state = makeAppState({ opps: [] });

    expect(invertCommand({ type: 'add_opportunity', opp }, state)).toEqual({
      type: 'delete_opportunity',
      oppId: 'o1',
    });

    const stateWithOpp = makeAppState({ opps: [opp] });
    expect(invertCommand({ type: 'delete_opportunity', oppId: 'o1' }, stateWithOpp)).toEqual({
      type: 'add_opportunity',
      opp,
    });
  });
});

describe('invertCommand — cats & roles', () => {
  it('set_cats → set_cats s předchozí hodnotou celého recordu', () => {
    const state = makeAppState();

    const inverse = invertCommand({ type: 'set_cats', cats: { nove: state.cats.obecne } }, state);

    expect(inverse).toEqual({ type: 'set_cats', cats: state.cats });
  });

  it('set_roles → set_roles s předchozí hodnotou celého recordu', () => {
    const state = makeAppState();

    const inverse = invertCommand({ type: 'set_roles', roles: {} }, state);

    expect(inverse).toEqual({ type: 'set_roles', roles: state.roles });
  });
});

describe('invertCommand — knowledge base', () => {
  it('add_kb_page → delete_kb_page a zpět se snapshotem', () => {
    const page = makeKbPage({ id: 'kb1' });
    const emptyState = makeAppState({ kbPages: [] });
    const stateWithPage = makeAppState({ kbPages: [page] });

    expect(invertCommand({ type: 'add_kb_page', page }, emptyState)).toEqual({
      type: 'delete_kb_page',
      pageId: 'kb1',
    });
    expect(invertCommand({ type: 'delete_kb_page', pageId: 'kb1' }, stateWithPage)).toEqual({
      type: 'add_kb_page',
      page,
    });
  });

  it('update_kb_page → update_kb_page s předchozím obsahem', () => {
    const page = makeKbPage({ id: 'kb1', content: 'Starý obsah' });
    const state = makeAppState({ kbPages: [page] });

    expect(
      invertCommand(
        { type: 'update_kb_page', pageId: 'kb1', fields: { content: 'Nový obsah' } },
        state
      )
    ).toEqual({ type: 'update_kb_page', pageId: 'kb1', fields: { content: 'Starý obsah' } });
  });
});

describe('invertCommand — TODO a Reminders (per-user, mimo ProjectDiff protokol)', () => {
  it('add_todo → delete_todo a zpět se snapshotem', () => {
    const todo = makeTodo({ id: 'td1' });
    const emptyState = makeAppState({ todos: [] });
    const stateWithTodo = makeAppState({ todos: [todo] });

    expect(invertCommand({ type: 'add_todo', todo }, emptyState)).toEqual({
      type: 'delete_todo',
      todoId: 'td1',
    });
    expect(invertCommand({ type: 'delete_todo', todoId: 'td1' }, stateWithTodo)).toEqual({
      type: 'add_todo',
      todo,
    });
  });

  it('update_todo → update_todo s předchozí hodnotou completed', () => {
    const todo = makeTodo({ id: 'td1', completed: false });
    const state = makeAppState({ todos: [todo] });

    expect(
      invertCommand({ type: 'update_todo', todoId: 'td1', fields: { completed: true } }, state)
    ).toEqual({ type: 'update_todo', todoId: 'td1', fields: { completed: false } });
  });

  it('add_reminder → delete_reminder a zpět se snapshotem', () => {
    const reminder = makeReminder({ id: 'rem1' });
    const emptyState = makeAppState({ reminders: [] });
    const stateWithReminder = makeAppState({ reminders: [reminder] });

    expect(invertCommand({ type: 'add_reminder', reminder }, emptyState)).toEqual({
      type: 'delete_reminder',
      reminderId: 'rem1',
    });
    expect(
      invertCommand({ type: 'delete_reminder', reminderId: 'rem1' }, stateWithReminder)
    ).toEqual({
      type: 'add_reminder',
      reminder,
    });
  });

  it('update_reminder → update_reminder s předchozím enabled', () => {
    const reminder = makeReminder({ id: 'rem1', enabled: true });
    const state = makeAppState({ reminders: [reminder] });

    expect(
      invertCommand(
        { type: 'update_reminder', reminderId: 'rem1', fields: { enabled: false } },
        state
      )
    ).toEqual({ type: 'update_reminder', reminderId: 'rem1', fields: { enabled: true } });
  });
});
