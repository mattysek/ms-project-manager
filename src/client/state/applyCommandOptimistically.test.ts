// Testy applyCommandOptimistically — zrcadlo applyDiff.test.ts, ale nad ProjectCommand
// (ADR-004 „Optimistická aplikace").
import { describe, expect, it } from 'vitest';
import { applyCommandOptimistically } from './applyCommandOptimistically';
import { makeAppState, makePerson, makeTask } from './testFixtures';

describe('applyCommandOptimistically — tasks', () => {
  it('add_task přidá úkol do seznamu', () => {
    const state = makeAppState({ tasks: [] });
    const task = makeTask({ id: 't2' });
    const next = applyCommandOptimistically(state, { type: 'add_task', task });
    expect(next.tasks).toEqual([task]);
  });

  it('move_task nastaví s/e podle commandu', () => {
    const state = makeAppState({ tasks: [makeTask({ id: 't1', s: 0, e: 1 })] });
    const next = applyCommandOptimistically(state, { type: 'move_task', taskId: 't1', s: 3, e: 6 });
    expect(next.tasks[0]).toMatchObject({ s: 3, e: 6 });
  });

  it('update_progress nastaví progress', () => {
    const state = makeAppState({ tasks: [makeTask({ id: 't1', progress: 0 })] });
    const next = applyCommandOptimistically(state, {
      type: 'update_progress',
      taskId: 't1',
      progress: 80,
    });
    expect(next.tasks[0].progress).toBe(80);
  });

  it('delete_task odstraní úkol', () => {
    const state = makeAppState({ tasks: [makeTask({ id: 't1' })] });
    const next = applyCommandOptimistically(state, { type: 'delete_task', taskId: 't1' });
    expect(next.tasks).toEqual([]);
  });
});

describe('applyCommandOptimistically — people (update_alloc)', () => {
  it('update_alloc změní jen zadaný index weekAlloc', () => {
    const state = makeAppState({ people: [makePerson({ id: 'p1', weekAlloc: [100, 100, 100] })] });
    const next = applyCommandOptimistically(state, {
      type: 'update_alloc',
      personId: 'p1',
      weekIdx: 1,
      pct: 50,
    });
    expect(next.people[0].weekAlloc).toEqual([100, 50, 100]);
  });
});

describe('applyCommandOptimistically — commandy beze změny AppState', () => {
  it('update_presence vrací stav beze změny', () => {
    const state = makeAppState();
    const next = applyCommandOptimistically(state, { type: 'update_presence', view: 'gantt' });
    expect(next).toBe(state);
  });

  it('ado_run_sync vrací stav beze změny (výsledek přijde jako diff)', () => {
    const state = makeAppState();
    const next = applyCommandOptimistically(state, { type: 'ado_run_sync' });
    expect(next).toBe(state);
  });
});

describe('applyCommandOptimistically — import a projekt', () => {
  it('full_state_import nahradí celý stav', () => {
    const state = makeAppState();
    const imported = makeAppState({ tasks: [] });
    const next = applyCommandOptimistically(state, { type: 'full_state_import', state: imported });
    expect(next).toEqual(imported);
  });

  it('update_project smergne pole projektu', () => {
    const state = makeAppState();
    const next = applyCommandOptimistically(state, {
      type: 'update_project',
      fields: { budget: 250 },
    });
    expect(next.project.budget).toBe(250);
  });
});
