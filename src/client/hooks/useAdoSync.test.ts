// Testy useAdoSync — stavová a command vrstva ADO Sync (PRD-06, ADR-008).
//
// Hook se testuje bez serveru: `dispatch` je vitest mock (odchozí commandy) a
// diffy se do něj sypou ručně přes `handleDiff` (příchozí strana kanálu).
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAdoSync } from './useAdoSync';
import type { ADOConfig, ADODecisions, ADOWorkItemView, WIChange } from '../types';
import type { ProjectCommand, ProjectDiff } from '../types/protocol';

function setup() {
  const dispatch = vi.fn<(command: ProjectCommand) => void>();
  const { result } = renderHook(() => useAdoSync(dispatch));
  const send = (diff: ProjectDiff) => act(() => result.current.handleDiff(diff));
  return { dispatch, result, send };
}

const config: ADOConfig = {
  orgUrl: 'https://dev.azure.com/firma',
  project: 'NPEZ',
  areaPath: 'NPEZ\\Backend',
  trackedWiTypes: ['Bug', 'Product Backlog Item'],
  defaultPushWiType: 'Product Backlog Item',
  defaultIteration: 'NPEZ\\Sprint 42',
  mdToHoursCoefficient: 8,
  includePATInExport: false,
  memberMapping: [],
};

const emptyDecisions: ADODecisions = {
  ignoredGapIds: [],
  acknowledgedChanges: [],
  ignoredUnlinkedTaskIds: [],
};

function makeChange(overrides: Partial<WIChange> = {}): WIChange {
  return {
    type: 'state_regression',
    severity: 'high',
    direction: 'ado_to_planner',
    wiId: 1234,
    wiTitle: 'Refaktoring API autentizace',
    taskId: 't1',
    taskName: 'API refaktoring',
    details: 'Stav WI regredoval zpět na In Progress',
    oldValue: 'In Review',
    newValue: 'In Progress',
    ...overrides,
  };
}

function makeGap(overrides: Partial<ADOWorkItemView> = {}): ADOWorkItemView {
  return {
    id: 1400,
    title: 'Frontend integrace',
    state: 'New',
    workItemType: 'Product Backlog Item',
    assignedTo: null,
    assignedToEmail: null,
    areaPath: 'NPEZ\\Backend',
    iterationPath: 'NPEZ\\Sprint 42',
    descriptionMd: '',
    ...overrides,
  };
}

function syncCompleted(
  changes: WIChange[],
  gaps: ADOWorkItemView[],
  decisions: ADODecisions = emptyDecisions
): ProjectDiff {
  return {
    op: 'ado_sync_completed',
    changes,
    gaps,
    log: [],
    context: { workItems: [], lastSync: '2026-08-11T14:35:00.000Z', decisions },
  };
}

describe('useAdoSync — konfigurace a PAT', () => {
  it('výchozí stav hlásí, že PAT není nastaven', () => {
    const { result } = setup();

    expect(result.current.patStatus).toEqual({ patSet: false, patUpdatedAt: null });
  });

  it('savePat pošle command a ado_pat_saved promítne stav PATu (hodnota tokenu nikde)', () => {
    const { dispatch, result, send } = setup();

    act(() => result.current.commands.savePat('tajny-token'));
    send({ op: 'ado_pat_saved', patSet: true, patUpdatedAt: '2026-08-11T14:30:00.000Z' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ado_save_pat', pat: 'tajny-token' });
    expect(result.current.patStatus).toEqual({
      patSet: true,
      patUpdatedAt: '2026-08-11T14:30:00.000Z',
    });
    // ADR-008: PAT se ke klientovi nikdy nevrací, takže ho stav hooku nedrží.
    expect(JSON.stringify(result.current.patStatus)).not.toContain('tajny-token');
  });

  it('deletePat pošle command a ado_pat_saved s patSet=false stav vynuluje', () => {
    const { dispatch, result, send } = setup();
    send({ op: 'ado_pat_saved', patSet: true, patUpdatedAt: '2026-08-11T14:30:00.000Z' });

    act(() => result.current.commands.deletePat());
    send({ op: 'ado_pat_saved', patSet: false });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ado_delete_pat' });
    expect(result.current.patStatus).toEqual({ patSet: false, patUpdatedAt: null });
  });

  it('saveConfig pošle konfiguraci; ado_config_updated nese jen stav PATu', () => {
    const { dispatch, result, send } = setup();

    act(() => result.current.commands.saveConfig(config));
    send({
      op: 'ado_config_updated',
      config,
      patSet: true,
      patUpdatedAt: '2026-08-11T14:30:00.000Z',
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ado_save_config', config });
    expect(result.current.patStatus.patSet).toBe(true);
  });

  it('testConnection pošle command a výsledek se drží inline pro zobrazení', () => {
    const { dispatch, result, send } = setup();

    act(() => result.current.commands.testConnection());
    send({
      op: 'ado_connection_tested',
      ok: true,
      message: 'Připojení úspěšné — přihlášen jako Jan Novák (jan.novak@firma.cz)',
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ado_test_connection' });
    expect(result.current.connectionTest).toEqual({
      ok: true,
      message: 'Připojení úspěšné — přihlášen jako Jan Novák (jan.novak@firma.cz)',
    });
  });

  it('neúspěšné ověření připojení se drží stejnou cestou jako úspěšné', () => {
    const { result, send } = setup();

    send({
      op: 'ado_connection_tested',
      ok: false,
      message: 'Ověření selhalo: Neplatný nebo expirovaný Personal Access Token',
    });

    expect(result.current.connectionTest?.ok).toBe(false);
  });
});

describe('useAdoSync — průběh a výsledek syncu', () => {
  it('runSync zapne indikátor už při odeslání, ne až první zprávou ze serveru', () => {
    const { dispatch, result } = setup();

    act(() => result.current.commands.runSync());

    expect(dispatch).toHaveBeenCalledWith({ type: 'ado_run_sync' });
    expect(result.current.syncing).toBe(true);
    expect(result.current.progress).toBeNull();
  });

  it('ado_sync_progress promítne fázi i počty pro zobrazení průběhu', () => {
    const { result, send } = setup();

    send({ op: 'ado_sync_progress', phase: 'Stahuji work items', completed: 42, total: 87 });

    expect(result.current.progress).toEqual({
      phase: 'Stahuji work items',
      completed: 42,
      total: 87,
    });
    expect(result.current.syncing).toBe(true);
  });

  it('ado_sync_completed uloží změny, gap a kontext a ukončí průběh', () => {
    const { result, send } = setup();
    act(() => result.current.commands.runSync());

    send({
      op: 'ado_sync_completed',
      changes: [makeChange()],
      gaps: [makeGap()],
      log: [],
      context: {
        workItems: [makeGap({ id: 1234, title: 'Refaktoring API autentizace' })],
        lastSync: '2026-08-11T14:35:00.000Z',
        decisions: emptyDecisions,
      },
    });

    expect(result.current.syncing).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.result?.lastSync).toBe('2026-08-11T14:35:00.000Z');
    expect(result.current.result?.workItems).toHaveLength(1);
    expect(result.current.visibleChanges).toHaveLength(1);
    expect(result.current.visibleGaps).toHaveLength(1);
  });

  it('chyba syncu ukončí indikátor, aby „synchronizuji…" nezůstalo viset', () => {
    const { result, send } = setup();
    act(() => result.current.commands.runSync());

    send({
      op: 'error',
      message: 'Není uložený PAT — zadejte ho v nastavení ADO Sync',
      commandType: 'ado_run_sync',
    });

    expect(result.current.syncing).toBe(false);
  });

  it('chyba jiného commandu se indikátoru syncu netýká', () => {
    const { result, send } = setup();
    act(() => result.current.commands.runSync());

    send({ op: 'error', message: 'Úkol už neexistuje', commandType: 'ado_push_state' });

    expect(result.current.syncing).toBe(true);
  });

  it('diff, který se ADO netýká, stav hooku nemění', () => {
    const { result, send } = setup();
    const before = result.current.patStatus;

    send({ op: 'task_deleted', taskId: 't1' });

    expect(result.current.patStatus).toBe(before);
  });
});

describe('useAdoSync — rozhodnutí uživatele', () => {
  // @scenario: ado-sync.feature > Ignorování změny
  it('ignorovaná změna zmizí ze seznamu a nevrátí se ani po dalším syncu', () => {
    const { dispatch, result, send } = setup();
    send(syncCompleted([makeChange()], []));

    act(() => result.current.commands.acknowledgeChange(makeChange(), true));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ado_acknowledge_change',
      wiId: 1234,
      changeType: 'state_regression',
      acknowledged: true,
    });
    expect(result.current.visibleChanges).toEqual([]);

    // Další sync přinese rozhodnutí ze snapshotu — změna zůstane skrytá.
    send(
      syncCompleted([makeChange()], [], {
        ...emptyDecisions,
        acknowledgedChanges: ['1234-state_regression-In Progress'],
      })
    );
    expect(result.current.visibleChanges).toEqual([]);
  });

  // @scenario: ado-sync.feature > Potvrzení platí jen pro viděnou hodnotu
  it('klíč potvrzení nese i viděnou hodnotu — jinak by ho sync neuměl spárovat', () => {
    const { result, send } = setup();
    send(syncCompleted([makeChange()], []));

    // Přesně ten klíč, který uloží server (`changeKey` v Domain/Ado.fs).
    act(() => result.current.commands.acknowledgeChange(makeChange(), true));
    send(
      syncCompleted([makeChange()], [], {
        ...emptyDecisions,
        acknowledgedChanges: ['1234-state_regression-In Progress'],
      })
    );
    expect(result.current.visibleChanges).toEqual([]);

    // Horší regrese na stejném WI je jiná hodnota, takže se ukáže znovu.
    send(
      syncCompleted([makeChange({ newValue: 'New', oldValue: 'Done' })], [], {
        ...emptyDecisions,
        acknowledgedChanges: ['1234-state_regression-In Progress'],
      })
    );
    expect(result.current.visibleChanges).toHaveLength(1);
  });

  it('rozdíl přiřazení se potvrzuje bez hodnoty — server ji do klíče nedává', () => {
    const { result, send } = setup();
    const differs = makeChange({
      type: 'planner_assignment_differs',
      severity: 'medium',
      direction: 'planner_to_ado',
      oldValue: 'Petra Kolářová',
      newValue: 'Jan Novák',
    });
    send(syncCompleted([differs], []));

    act(() => result.current.commands.acknowledgeChange(differs, true));
    send(
      syncCompleted([differs], [], {
        ...emptyDecisions,
        acknowledgedChanges: ['1234-planner_assignment_differs'],
      })
    );

    expect(result.current.visibleChanges).toEqual([]);
  });

  it('potvrzení skryje jen dotčenou změnu, ostatní na stejném WI zůstanou', () => {
    const { result, send } = setup();
    send(
      syncCompleted(
        [makeChange(), makeChange({ type: 'description_change', severity: 'sync' })],
        []
      )
    );

    act(() => result.current.commands.acknowledgeChange(makeChange(), true));

    expect(result.current.visibleChanges.map((change) => change.type)).toEqual([
      'description_change',
    ]);
  });

  it('odvolané potvrzení změnu vrátí zpět do seznamu', () => {
    const { result, send } = setup();
    send(syncCompleted([makeChange()], []));
    act(() => result.current.commands.acknowledgeChange(makeChange(), true));

    act(() => result.current.commands.acknowledgeChange(makeChange(), false));

    expect(result.current.visibleChanges).toHaveLength(1);
  });

  // @scenario: ado-sync.feature > Ignorování coverage gap
  it('ignorovaný coverage gap zmizí ze sekce a nevrátí se ani po dalším syncu', () => {
    const { dispatch, result, send } = setup();
    send(syncCompleted([], [makeGap()]));

    act(() => result.current.commands.ignoreGap(1400, true));

    expect(dispatch).toHaveBeenCalledWith({ type: 'ado_ignore_gap', wiId: 1400, ignored: true });
    expect(result.current.visibleGaps).toEqual([]);

    // Server coverage gap podle rozhodnutí nefiltruje — filtruje se tady,
    // podle rozhodnutí, která přijdou ve snapshotu s výsledkem syncu.
    send(syncCompleted([], [makeGap()], { ...emptyDecisions, ignoredGapIds: [1400] }));
    expect(result.current.visibleGaps).toEqual([]);
  });

  it('ignoreUnlinkedTask pošle command a rozhodnutí si drží pro filtr úkolů', () => {
    const { dispatch, result } = setup();

    act(() => result.current.commands.ignoreUnlinkedTask('t2', true));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ado_ignore_unlinked_task',
      taskId: 't2',
      ignored: true,
    });
    expect(result.current.decisions.ignoredUnlinkedTaskIds).toEqual(['t2']);
  });
});

describe('useAdoSync — akce nad výsledkem', () => {
  it('acceptFromAdo pošle převzetí popisu se sloučeným textem', () => {
    const { dispatch, result } = setup();

    act(() =>
      result.current.commands.acceptFromAdo({
        wiId: 1234,
        taskId: 't1',
        field: 'description',
        text: 'Sloučený popis',
      })
    );

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ado_accept_from_ado',
      wiId: 1234,
      taskId: 't1',
      field: 'description',
      text: 'Sloučený popis',
    });
  });

  it('pushAssignee pošle jen identifikátory — mapování na ADO identitu řeší server', () => {
    const { dispatch, result } = setup();

    act(() => result.current.commands.pushAssignee(1234, 't1'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ado_push_assignee',
      wiId: 1234,
      taskId: 't1',
    });
  });

  it('pushState pošle cílový stav work itemu', () => {
    const { dispatch, result } = setup();

    act(() => result.current.commands.pushState(1234, 't1', 'Resolved'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ado_push_state',
      wiId: 1234,
      taskId: 't1',
      state: 'Resolved',
    });
  });

  it('pushDescription s alsoPlanner znamená obousměrný merge', () => {
    const { dispatch, result } = setup();

    act(() =>
      result.current.commands.pushDescription({
        wiId: 1234,
        taskId: 't1',
        text: 'Sloučený popis',
        alsoPlanner: true,
      })
    );

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ado_push_description',
      wiId: 1234,
      taskId: 't1',
      text: 'Sloučený popis',
      alsoPlanner: true,
    });
  });
});

describe('useAdoSync — push do ADO a coverage gap', () => {
  it('createWorkItem pošle draft s hodinami spočtenými z MD', () => {
    const { dispatch, result } = setup();
    const draft = {
      wiType: 'Product Backlog Item',
      title: 'Databázová migrace',
      descriptionMd: '',
      areaPath: 'NPEZ\\Backend',
      iterationPath: 'NPEZ\\Sprint 42',
      assignedTo: 'jan.novak@firma.cz',
      remainingWork: 80,
    };

    act(() => result.current.commands.createWorkItem('t2', draft));

    expect(dispatch).toHaveBeenCalledWith({ type: 'ado_create_work_item', taskId: 't2', draft });
  });

  it('addGapToPlan pošle celý úkol — nový úkol vznikne až serverovým diffem', () => {
    const { dispatch, result } = setup();
    const task = {
      id: 't3',
      p: 'p1',
      name: 'Frontend integrace',
      cat: 'obecne',
      s: 0,
      e: 1,
      md: 5,
      progress: 0,
      desc: '',
      links: [],
    };

    act(() => result.current.commands.addGapToPlan(1400, task));

    expect(dispatch).toHaveBeenCalledWith({ type: 'ado_add_gap_to_plan', wiId: 1400, task });
  });

  it('linkGapToTask pošle propojení gapu s existujícím úkolem', () => {
    const { dispatch, result } = setup();

    act(() => result.current.commands.linkGapToTask(1400, 't1'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ado_link_gap_to_task',
      wiId: 1400,
      taskId: 't1',
    });
  });

  it('ado_sync_log_appended zpřístupní poslední záznam pro potvrzovací hlášku', () => {
    const { result, send } = setup();
    const entry = {
      id: 'log1',
      timestamp: '2026-08-11T14:36:00.000Z',
      action: 'PUSHED_TO_ADO' as const,
      taskId: 't1',
      taskName: 'API refaktoring',
      wiId: 1234,
      wiTitle: 'Refaktoring API autentizace',
      details: 'AssignedTo aktualizováno',
    };

    send({ op: 'ado_sync_log_appended', entry });

    expect(result.current.lastLogEntry).toEqual(entry);
  });
});
