// Rozpad práce napříč projekty do kalendářních týdnů (my-work.feature).
//
// Server posílá fakta s reálnými datumy; dostupnost (pracovní dny minus české
// svátky) počítá klient, protože kalendář je klientský výpočet (ADR-005).
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as workloadApi from '../../api/workloadApi';
import type { MyTask } from '../../api/workloadApi';
import { useMyWorkload } from './useMyWorkload';

function task(over: Partial<MyTask> & Pick<MyTask, 'taskId' | 'md'>): MyTask {
  return {
    projectId: 'p1',
    projectName: 'Backend refaktoring',
    name: 'Úkol',
    cat: 'obecne',
    progress: 0,
    ...over,
  };
}

function mockWorkload(tasks: MyTask[]) {
  vi.spyOn(workloadApi, 'fetchMyWorkload').mockResolvedValue({ staleAfterSeconds: 5, tasks });
  return renderHook(() => useMyWorkload());
}

afterEach(() => vi.restoreAllMocks());

describe('useMyWorkload', () => {
  // @scenario: my-work.feature > Úkoly jsou seskupené podle kalendářních týdnů
  it('rozdělí úkoly ze dvou projektů podle skutečných týdnů', async () => {
    // W1 dvou projektů, které začínají jinde, jsou dva různé kalendářní týdny.
    const { result } = mockWorkload([
      task({ taskId: 't1', md: 2, fromIso: '2026-01-05', toIso: '2026-01-09' }),
      task({
        taskId: 't2',
        md: 2,
        projectId: 'p2',
        projectName: 'Mobilní klient',
        fromIso: '2026-02-02',
        toIso: '2026-02-06',
      }),
    ]);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.weeks.map((week) => week.mondayIso)).toEqual([
      '2026-01-05',
      '2026-02-02',
    ]);
  });

  // @scenario: my-work.feature > Přetížení napříč projekty je vidět
  it('sečte MD ze dvou projektů ve stejném týdnu', async () => {
    const { result } = mockWorkload([
      task({ taskId: 't1', md: 3, fromIso: '2026-01-05', toIso: '2026-01-09' }),
      task({
        taskId: 't2',
        md: 4,
        projectId: 'p2',
        projectName: 'Mobilní klient',
        fromIso: '2026-01-05',
        toIso: '2026-01-09',
      }),
    ]);

    await waitFor(() => expect(result.current.loading).toBe(false));

    const week = result.current.weeks[0];
    expect(week.demand).toBe(7);
    expect(week.workdays).toBe(5);
    expect(week.tasks).toHaveLength(2);
  });

  // @scenario: my-work.feature > Sváteční týden má menší dostupnost
  it('sváteční týden má nižší dostupnost', async () => {
    // 8. 5. 2026 (Den vítězství) je pátek — týden od 4. 5. má 4 pracovní dny.
    const { result } = mockWorkload([
      task({ taskId: 't1', md: 4, fromIso: '2026-05-04', toIso: '2026-05-08' }),
    ]);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.weeks[0].workdays).toBe(4);
  });

  it('rozprostře MD přes týdny poměrně podle pracovních dnů', async () => {
    // Úkol přes zkrácený a plný týden — porce nesmí být stejné, jinak
    // sváteční týden dostane víc práce, než na kolik má dnů. Týden od 4. 5.
    // 2026 zkracuje pátek 8. 5., ten následující je plný.
    const { result } = mockWorkload([
      task({ taskId: 't1', md: 9, fromIso: '2026-05-04', toIso: '2026-05-15' }),
    ]);

    await waitFor(() => expect(result.current.loading).toBe(false));

    const [short, full] = result.current.weeks;
    expect(short.workdays).toBe(4);
    expect(full.workdays).toBe(5);
    expect(short.demand).toBeLessThan(full.demand);
    expect(short.demand + full.demand).toBeCloseTo(9, 1);
  });

  // @scenario: my-work.feature > Úkol bez termínu se ukáže zvlášť
  it('úkol bez termínu nezkreslí žádný týden', async () => {
    const { result } = mockWorkload([
      task({ taskId: 't1', md: 5, fromIso: '2026-01-05', toIso: '2026-01-09' }),
      task({ taskId: 't2', md: 99, projectId: 'p2', projectName: 'Bez datumů' }),
    ]);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.weeks).toHaveLength(1);
    expect(result.current.weeks[0].demand).toBe(5);
    expect(result.current.undated.map((item) => item.taskId)).toEqual(['t2']);
  });

  it('týdny bez práce se nezobrazují', async () => {
    const { result } = mockWorkload([
      task({ taskId: 't1', md: 2, fromIso: '2026-01-05', toIso: '2026-01-09' }),
      task({ taskId: 't2', md: 2, fromIso: '2026-02-02', toIso: '2026-02-06' }),
    ]);

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Mezi 5. 1. a 2. 2. leží tři prázdné týdny — v přehledu nemají co dělat.
    expect(result.current.weeks).toHaveLength(2);
  });

  it('chybu načtení ohlásí a nespadne', async () => {
    vi.spyOn(workloadApi, 'fetchMyWorkload').mockRejectedValue(new Error('Server neodpovídá'));
    const { result } = renderHook(() => useMyWorkload());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Server neodpovídá');
    expect(result.current.weeks).toHaveLength(0);
  });
});
