// Testy applyDiff — čisté redukce ProjectDiff → AppState (FR-COLLAB-03, ADR-004).
import { describe, expect, it } from 'vitest';
import { applyDiff } from './applyDiff';
import type { ProjectDiff } from '../types/protocol';
import {
  makeAppState,
  makeTask,
  makePerson,
  makeRisk,
  makeOpportunity,
  makeKbPage,
  makeTodo,
  makeReminder,
  makeFileRef,
} from './testFixtures';

describe('applyDiff — tasks', () => {
  it('task_added přidá úkol do seznamu', () => {
    const state = makeAppState({ tasks: [] });
    const newTask = makeTask({ id: 't2', name: 'Nový úkol' });
    const diff: ProjectDiff = { op: 'task_added', task: newTask };

    const next = applyDiff(state, diff);

    expect(next.tasks).toEqual([newTask]);
    expect(state.tasks).toEqual([]); // původní stav nezmutovaný
  });

  it('task_updated aplikuje jen dotčená pole, zbytek zachová', () => {
    const task = makeTask({ id: 't1', name: 'Původní', progress: 10 });
    const state = makeAppState({ tasks: [task] });
    const diff: ProjectDiff = { op: 'task_updated', taskId: 't1', fields: { progress: 50 } };

    const next = applyDiff(state, diff);

    expect(next.tasks[0]).toEqual({ ...task, progress: 50 });
    expect(next.tasks[0].name).toBe('Původní');
  });

  it('task_deleted odstraní úkol podle id, ostatní nechá být', () => {
    const t1 = makeTask({ id: 't1' });
    const t2 = makeTask({ id: 't2' });
    const state = makeAppState({ tasks: [t1, t2] });

    const next = applyDiff(state, { op: 'task_deleted', taskId: 't1' });

    expect(next.tasks).toEqual([t2]);
  });
});

describe('applyDiff — people', () => {
  it('person_added přidá osobu', () => {
    const state = makeAppState({ people: [] });
    const person = makePerson({ id: 'p2' });

    const next = applyDiff(state, { op: 'person_added', person });

    expect(next.people).toEqual([person]);
  });

  it('person_updated aktualizuje jen zadaná pole', () => {
    const person = makePerson({ id: 'p1', name: 'Stará' });
    const state = makeAppState({ people: [person] });

    const next = applyDiff(state, {
      op: 'person_updated',
      personId: 'p1',
      fields: { name: 'Nová' },
    });

    expect(next.people[0].name).toBe('Nová');
    expect(next.people[0].role).toBe(person.role);
  });

  it('person_deleted odstraní osobu podle id', () => {
    const person = makePerson({ id: 'p1' });
    const state = makeAppState({ people: [person] });

    const next = applyDiff(state, { op: 'person_deleted', personId: 'p1' });

    expect(next.people).toEqual([]);
  });
});

describe('applyDiff — metadata projektu', () => {
  it('project_updated slije zadaná pole do project', () => {
    const state = makeAppState();

    const next = applyDiff(state, {
      op: 'project_updated',
      fields: { name: 'Nový název', budget: 500 },
    });

    expect(next.project.name).toBe('Nový název');
    expect(next.project.budget).toBe(500);
    expect(next.project.startDate).toBe(state.project.startDate);
  });

  it('milestones_set nahradí milestones v rámci project', () => {
    const state = makeAppState();
    const milestones = [{ id: 'm1', title: 'Milník', weekIndex: 2, checkItems: [] }];

    const next = applyDiff(state, { op: 'milestones_set', milestones });

    expect(next.project.milestones).toEqual(milestones);
  });
});

describe('applyDiff — risks & opportunities', () => {
  it('risk_added / risk_updated / risk_deleted', () => {
    const state = makeAppState({ risks: [] });
    const risk = makeRisk({ id: 'r1' });

    const afterAdd = applyDiff(state, { op: 'risk_added', risk });
    expect(afterAdd.risks).toEqual([risk]);

    const afterUpdate = applyDiff(afterAdd, {
      op: 'risk_updated',
      riskId: 'r1',
      fields: { sev: 'high' },
    });
    expect(afterUpdate.risks[0].sev).toBe('high');

    const afterDelete = applyDiff(afterUpdate, { op: 'risk_deleted', riskId: 'r1' });
    expect(afterDelete.risks).toEqual([]);
  });

  it('opportunity_added / opportunity_updated / opportunity_deleted', () => {
    const state = makeAppState({ opps: [] });
    const opp = makeOpportunity({ id: 'o1' });

    const afterAdd = applyDiff(state, { op: 'opportunity_added', opp });
    expect(afterAdd.opps).toEqual([opp]);

    const afterUpdate = applyDiff(afterAdd, {
      op: 'opportunity_updated',
      oppId: 'o1',
      fields: { title: 'Přejmenováno' },
    });
    expect(afterUpdate.opps[0].title).toBe('Přejmenováno');

    const afterDelete = applyDiff(afterUpdate, { op: 'opportunity_deleted', oppId: 'o1' });
    expect(afterDelete.opps).toEqual([]);
  });
});

describe('applyDiff — cats & roles', () => {
  it('cats_set nahradí celý Categories record', () => {
    const state = makeAppState();
    const cats = { nova: { bg: '#000', bd: '#111', tx: '#222', label: 'Nová' } };

    const next = applyDiff(state, { op: 'cats_set', cats });

    expect(next.cats).toEqual(cats);
  });

  it('roles_set nahradí celý Roles record', () => {
    const state = makeAppState();
    const roles = { QA: { label: 'Quality Assurance' } };

    const next = applyDiff(state, { op: 'roles_set', roles });

    expect(next.roles).toEqual(roles);
  });
});

describe('applyDiff — knowledge base', () => {
  it('kb_page_added / kb_page_updated / kb_page_deleted', () => {
    const state = makeAppState({ kbPages: [] });
    const page = makeKbPage({ id: 'kb1' });

    const afterAdd = applyDiff(state, { op: 'kb_page_added', page });
    expect(afterAdd.kbPages).toEqual([page]);

    const afterUpdate = applyDiff(afterAdd, {
      op: 'kb_page_updated',
      pageId: 'kb1',
      fields: { title: 'Přejmenovaná stránka' },
    });
    expect(afterUpdate.kbPages[0].title).toBe('Přejmenovaná stránka');

    const afterDelete = applyDiff(afterUpdate, { op: 'kb_page_deleted', pageId: 'kb1' });
    expect(afterDelete.kbPages).toEqual([]);
  });
});

describe('applyDiff — full_state, error, presence', () => {
  it('full_state kompletně nahradí AppState stavem ze serveru', () => {
    const state = makeAppState();
    const serverState = makeAppState({ tasks: [], people: [] });

    const next = applyDiff(state, { op: 'full_state', state: serverState });

    expect(next).toBe(serverState);
  });

  it('error nezmění doménový stav (rollback řeší volající)', () => {
    const state = makeAppState();

    const next = applyDiff(state, {
      op: 'error',
      message: 'Nevalidní command',
      commandType: 'move_task',
    });

    expect(next).toBe(state);
  });

  it('presence nezmění doménový stav (AppState presence nemodeluje)', () => {
    const state = makeAppState();

    const next = applyDiff(state, {
      op: 'presence',
      users: [{ userId: 'u1', displayName: 'Jan Novák', view: 'gantt', color: '#4f9cf9' }],
    });

    expect(next).toBe(state);
  });
});

describe('applyDiff — TODO a Reminders (doplněk ADR-004, per-user diffy)', () => {
  it('todo_added / todo_updated / todo_deleted', () => {
    const state = makeAppState({ todos: [] });
    const todo = makeTodo({ id: 'td1', completed: false });

    const afterAdd = applyDiff(state, { op: 'todo_added', todo });
    expect(afterAdd.todos).toEqual([todo]);

    const afterUpdate = applyDiff(afterAdd, {
      op: 'todo_updated',
      todoId: 'td1',
      fields: { completed: true },
    });
    expect(afterUpdate.todos[0].completed).toBe(true);

    const afterDelete = applyDiff(afterUpdate, { op: 'todo_deleted', todoId: 'td1' });
    expect(afterDelete.todos).toEqual([]);
  });

  it('reminder_added / reminder_updated / reminder_deleted', () => {
    const state = makeAppState({ reminders: [] });
    const reminder = makeReminder({ id: 'rem1', enabled: true });

    const afterAdd = applyDiff(state, { op: 'reminder_added', reminder });
    expect(afterAdd.reminders).toEqual([reminder]);

    const afterUpdate = applyDiff(afterAdd, {
      op: 'reminder_updated',
      reminderId: 'rem1',
      fields: { enabled: false },
    });
    expect(afterUpdate.reminders[0].enabled).toBe(false);

    const afterDelete = applyDiff(afterUpdate, { op: 'reminder_deleted', reminderId: 'rem1' });
    expect(afterDelete.reminders).toEqual([]);
  });
});

// Tyhle dva diffy klient původně vůbec neznal — server je posílal a `applyDiff`
// je tiše zahazoval, takže cizí změna alokace ani položky checklistu se
// k ostatním uživatelům nikdy nedostala. Hlídá to i `build/protocol-contract.mjs`.
describe('applyDiff — alokace a checklist milníku', () => {
  it('alloc_updated změní jen dotčený týden dotčené osoby', () => {
    const petra = makePerson({ id: 'p1', weekAlloc: [100, 100, 100] });
    const jan = makePerson({ id: 'p2', weekAlloc: [50, 50, 50] });
    const state = makeAppState({ people: [petra, jan] });

    const next = applyDiff(state, { op: 'alloc_updated', personId: 'p1', weekIdx: 1, pct: 80 });

    expect(next.people[0].weekAlloc).toEqual([100, 80, 100]);
    expect(next.people[1].weekAlloc).toEqual([50, 50, 50]);
    expect(state.people[0].weekAlloc).toEqual([100, 100, 100]); // beze změny
  });

  it('alloc_updated na neznámou osobu stav nerozbije', () => {
    const state = makeAppState({ people: [makePerson({ id: 'p1', weekAlloc: [100] })] });

    const next = applyDiff(state, { op: 'alloc_updated', personId: 'neznamy', weekIdx: 0, pct: 0 });

    expect(next.people[0].weekAlloc).toEqual([100]);
  });

  it('milestone_checklist_updated přepíše položky jen u dotčeného milníku', () => {
    const state = makeAppState({
      project: {
        ...makeAppState().project,
        milestones: [
          { id: 'm1', title: 'Analýza', weekIndex: 2, checkItems: [] },
          { id: 'm2', title: 'Vývoj', weekIndex: 8, checkItems: [] },
        ],
      },
    });
    const checkItems = [{ id: 'c1', text: 'Schválit zadání', completed: true }];

    const next = applyDiff(state, {
      op: 'milestone_checklist_updated',
      milestoneId: 'm1',
      checkItems,
    });

    expect(next.project.milestones[0].checkItems).toEqual(checkItems);
    expect(next.project.milestones[1].checkItems).toEqual([]);
  });
});

describe('applyDiff — soubory (ADR-010)', () => {
  it('file_added / file_note_updated / file_deleted', () => {
    const state = makeAppState({ files: [] });
    const file = makeFileRef({ id: 'f1', note: '' });

    const afterAdd = applyDiff(state, { op: 'file_added', file });
    expect(afterAdd.files).toEqual([file]);

    const afterUpdate = applyDiff(afterAdd, {
      op: 'file_note_updated',
      fileId: 'f1',
      note: 'Finální verze',
    });
    expect(afterUpdate.files[0].note).toBe('Finální verze');

    const afterDelete = applyDiff(afterUpdate, { op: 'file_deleted', fileId: 'f1' });
    expect(afterDelete.files).toEqual([]);
  });
});

// Autor commandu vidí vlastní `*_added` diff zpátky (`Clients.Group` i
// `SenderOnly` míří i na něj), přičemž tutéž entitu už má optimisticky
// aplikovanou. Bez upsertu podle id ji viděl dvakrát až do nejbližšího
// `full_state` — E2E to odhalilo na TODO, ale týkalo se to všech entit.
describe('applyDiff — echo vlastního přidání nesmí entitu zdvojit', () => {
  it('opakovaný *_added se stejným id jen přepíše serverovou verzí', () => {
    const optimistic = makeTodo({ id: 'td1', title: 'Zkontrolovat PR' });
    const state = makeAppState({
      todos: [optimistic],
      tasks: [makeTask({ id: 't1' })],
      people: [makePerson({ id: 'p1' })],
      risks: [makeRisk({ id: 'r1' })],
      opps: [makeOpportunity({ id: 'o1' })],
      kbPages: [makeKbPage({ id: 'k1' })],
      reminders: [makeReminder({ id: 'rm1' })],
      files: [makeFileRef({ id: 'f1' })],
    });

    const echoes: ProjectDiff[] = [
      { op: 'todo_added', todo: makeTodo({ id: 'td1', title: 'Zkontrolovat PR' }) },
      { op: 'task_added', task: makeTask({ id: 't1' }) },
      { op: 'person_added', person: makePerson({ id: 'p1' }) },
      { op: 'risk_added', risk: makeRisk({ id: 'r1' }) },
      { op: 'opportunity_added', opp: makeOpportunity({ id: 'o1' }) },
      { op: 'kb_page_added', page: makeKbPage({ id: 'k1' }) },
      { op: 'reminder_added', reminder: makeReminder({ id: 'rm1' }) },
      { op: 'file_added', file: makeFileRef({ id: 'f1' }) },
    ];

    const next = echoes.reduce(applyDiff, state);

    expect(next.todos).toHaveLength(1);
    expect(next.tasks).toHaveLength(1);
    expect(next.people).toHaveLength(1);
    expect(next.risks).toHaveLength(1);
    expect(next.opps).toHaveLength(1);
    expect(next.kbPages).toHaveLength(1);
    expect(next.reminders).toHaveLength(1);
    expect(next.files).toHaveLength(1);
  });

  it('*_added s jiným id se pořád přidá (změna od jiného uživatele)', () => {
    const state = makeAppState({ todos: [makeTodo({ id: 'td1' })] });
    const next = applyDiff(state, { op: 'todo_added', todo: makeTodo({ id: 'td2' }) });
    expect(next.todos.map((t) => t.id)).toEqual(['td1', 'td2']);
  });

  it('serverová verze přepíše optimistickou (reducer doplňuje pole)', () => {
    const state = makeAppState({ tasks: [makeTask({ id: 't1', name: 'Návrh' })] });
    const fromServer = makeTask({ id: 't1', name: 'Návrh', updatedBy: 'Jan Novák' });

    const next = applyDiff(state, { op: 'task_added', task: fromServer });

    expect(next.tasks).toEqual([fromServer]);
  });
});

/** Prázdná uživatelská rozhodnutí ve snapshotu — sync ještě nic neodklikl. */
const emptyDecisions = {
  ignoredGapIds: [],
  acknowledgedChanges: [],
  ignoredUnlinkedTaskIds: [],
};

describe('applyDiff — role a efemérní ADO diffy', () => {
  it('role_changed nezmění doménový stav (session role uživatele, mimo AppState)', () => {
    const state = makeAppState();

    const next = applyDiff(state, { op: 'role_changed', newRole: 'dev' });

    expect(next).toBe(state);
  });

  it('ado_sync_progress nezmění doménový stav (efemérní průběh syncu)', () => {
    const state = makeAppState();

    const next = applyDiff(state, {
      op: 'ado_sync_progress',
      phase: 'Stahuji work items',
      completed: 42,
      total: 87,
    });

    expect(next).toBe(state);
  });

  it('ado_pat_saved nezmění doménový stav (stav PATu je per-user, mimo AppState)', () => {
    const state = makeAppState();

    const next = applyDiff(state, {
      op: 'ado_pat_saved',
      patSet: true,
      patUpdatedAt: '2026-08-11T14:30:00.000Z',
    });

    expect(next).toBe(state);
  });

  it('ado_connection_tested nezmění doménový stav (jednorázový výsledek ověření)', () => {
    const state = makeAppState();

    const next = applyDiff(state, {
      op: 'ado_connection_tested',
      ok: true,
      message: 'Připojení úspěšné — připojeno jako Jan Novák',
    });

    expect(next).toBe(state);
  });
});

describe('applyDiff — ADO data projektu', () => {
  it('ado_config_updated nahradí adoConfig (PAT status se do AppState nepromítá)', () => {
    const state = makeAppState({ adoConfig: null });
    const config = {
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

    const next = applyDiff(state, {
      op: 'ado_config_updated',
      config,
      patSet: true,
      patUpdatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(next.adoConfig).toEqual(config);
  });

  it('ado_sync_completed nahradí adoSyncLog výsledným logem', () => {
    const state = makeAppState({ adoSyncLog: [] });
    const log = [
      {
        id: 'log1',
        timestamp: '2026-01-01T00:00:00.000Z',
        action: 'ACKNOWLEDGED' as const,
        details: 'Potvrzeno',
      },
    ];

    const next = applyDiff(state, {
      op: 'ado_sync_completed',
      changes: [],
      gaps: [],
      log,
      context: { workItems: [], lastSync: '2026-01-01T00:00:00.000Z', decisions: emptyDecisions },
    });

    expect(next.adoSyncLog).toEqual(log);
  });

  it('ado_sync_log_appended přidá záznam na začátek (append-only audit, nejnovější nahoře)', () => {
    const older = {
      id: 'log1',
      timestamp: '2026-08-11T10:00:00.000Z',
      action: 'LINKED' as const,
      details: 'Úkol propojen',
    };
    const state = makeAppState({ adoSyncLog: [older] });
    const entry = {
      id: 'log2',
      timestamp: '2026-08-11T14:35:00.000Z',
      action: 'PUSHED_TO_ADO' as const,
      taskId: 't1',
      taskName: 'API refaktoring',
      wiId: 1234,
      wiTitle: 'Refaktoring API autentizace',
      details: 'AssignedTo aktualizováno',
    };

    const next = applyDiff(state, { op: 'ado_sync_log_appended', entry });

    expect(next.adoSyncLog).toEqual([entry, older]);
    expect(state.adoSyncLog).toEqual([older]); // původní stav nezmutovaný
  });
});
