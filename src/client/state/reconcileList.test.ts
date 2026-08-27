// Testy reconcileList/reconcileTasks/reconcilePeople — odvození commandů ze
// změny pole (App.tsx slice settery volané z View komponent, ADR-004/ADR-005).
import { describe, expect, it } from 'vitest';
import { reconcileList, reconcilePeople, reconcileTasks } from './reconcileList';
import { makePerson, makeRisk, makeTask } from './testFixtures';

describe('reconcileList — obecný diff (risks)', () => {
  const factory = {
    add: (risk: ReturnType<typeof makeRisk>) => ({ type: 'add_risk' as const, risk }),
    update: (id: string, fields: object) => ({ type: 'update_risk' as const, riskId: id, fields }),
    remove: (id: string) => ({ type: 'delete_risk' as const, riskId: id }),
  };

  it('nová položka → add', () => {
    const risk = makeRisk({ id: 'r2' });
    const commands = reconcileList([], [risk], factory);
    expect(commands).toEqual([{ type: 'add_risk', risk }]);
  });

  it('chybějící položka → remove', () => {
    const risk = makeRisk({ id: 'r1' });
    const commands = reconcileList([risk], [], factory);
    expect(commands).toEqual([{ type: 'delete_risk', riskId: 'r1' }]);
  });

  it('změněné pole → update jen se změněnými poli', () => {
    const before = makeRisk({ id: 'r1', title: 'Staré' });
    const after = { ...before, title: 'Nové' };
    const commands = reconcileList([before], [after], factory);
    expect(commands).toEqual([{ type: 'update_risk', riskId: 'r1', fields: { title: 'Nové' } }]);
  });

  it('beze změny → žádný command', () => {
    const risk = makeRisk({ id: 'r1' });
    const commands = reconcileList([risk], [{ ...risk }], factory);
    expect(commands).toEqual([]);
  });
});

describe('reconcileTasks — move_task a update_progress mají přednost před update_task', () => {
  it('změna s a e → move_task', () => {
    const before = makeTask({ id: 't1', s: 0, e: 2 });
    const after = { ...before, s: 3, e: 6 };
    expect(reconcileTasks([before], [after])).toEqual([
      { type: 'move_task', taskId: 't1', s: 3, e: 6 },
    ]);
  });

  it('změna jen progress → update_progress', () => {
    const before = makeTask({ id: 't1', progress: 0 });
    const after = { ...before, progress: 40 };
    expect(reconcileTasks([before], [after])).toEqual([
      { type: 'update_progress', taskId: 't1', progress: 40 },
    ]);
  });

  it('změna jiných polí → update_task s diffem', () => {
    const before = makeTask({ id: 't1', name: 'Staré' });
    const after = { ...before, name: 'Nové' };
    expect(reconcileTasks([before], [after])).toEqual([
      { type: 'update_task', taskId: 't1', fields: { name: 'Nové' } },
    ]);
  });

  it('nový úkol → add_task, zmizelý → delete_task', () => {
    const kept = makeTask({ id: 't1' });
    const removed = makeTask({ id: 't2' });
    const added = makeTask({ id: 't3' });
    const commands = reconcileTasks([kept, removed], [kept, added]);
    expect(commands).toEqual([
      { type: 'add_task', task: added },
      { type: 'delete_task', taskId: 't2' },
    ]);
  });
});

describe('reconcilePeople — update_alloc pro jednu buňku, update_person jinak', () => {
  it('změna jednoho indexu weekAlloc → update_alloc', () => {
    const before = makePerson({ id: 'p1', weekAlloc: [100, 100, 100] });
    const after = { ...before, weekAlloc: [100, 50, 100] };
    expect(reconcilePeople([before], [after])).toEqual([
      { type: 'update_alloc', personId: 'p1', weekIdx: 1, pct: 50 },
    ]);
  });

  it('změna více indexů weekAlloc najednou → update_person', () => {
    const before = makePerson({ id: 'p1', weekAlloc: [100, 100, 100] });
    const after = { ...before, weekAlloc: [50, 50, 100] };
    expect(reconcilePeople([before], [after])).toEqual([
      { type: 'update_person', personId: 'p1', fields: { weekAlloc: [50, 50, 100] } },
    ]);
  });

  it('změna jména → update_person', () => {
    const before = makePerson({ id: 'p1', name: 'Staré jméno' });
    const after = { ...before, name: 'Nové jméno' };
    expect(reconcilePeople([before], [after])).toEqual([
      { type: 'update_person', personId: 'p1', fields: { name: 'Nové jméno' } },
    ]);
  });
});
