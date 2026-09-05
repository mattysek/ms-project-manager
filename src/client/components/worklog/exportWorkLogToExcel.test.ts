// Export výkazů do Excelu (worklog.feature, FR-WL-09).
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { exportWorkLogToExcel } from './exportWorkLogToExcel';
import { at, entry } from './worklogHarness';

// `vi.mock` je hoistovaný nad importy — proměnná musí jít přes `vi.hoisted`.
const { writeFileMock } = vi.hoisted(() => ({ writeFileMock: vi.fn() }));
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: writeFileMock };
});

const CONTEXT = {
  periodLabel: '1. 3. 2026 – 31. 3. 2026',
  filterLabel: 'pohotovost',
  projectNames: new Map([['p1', 'Backend refaktoring']]),
};

function exportedCsv(entries: Parameters<typeof exportWorkLogToExcel>[0]): string {
  writeFileMock.mockClear();
  exportWorkLogToExcel(entries, CONTEXT);
  const [workbook] = writeFileMock.mock.calls[0];
  return XLSX.utils.sheet_to_csv(workbook.Sheets.Výkaz);
}

describe('export výkazů', () => {
  // @scenario: worklog.feature > Export obsahuje právě to, co je po filtru vidět
  it('exportuje jen předaný (tedy vyfiltrovaný) seznam', () => {
    const csv = exportedCsv([
      entry({ id: 'a', title: 'Noční zásah', tags: ['pohotovost'], projectId: 'p1' }),
    ]);

    expect(csv).toContain('Noční zásah');
    expect(csv).toContain('pohotovost');
    expect(csv).toContain('Backend refaktoring');
    // Hlavička nese, co se vlastně exportovalo — jinak je soubor bez kontextu.
    expect(csv).toContain('1. 3. 2026 – 31. 3. 2026');
    expect(csv).toContain('Počet záznamů: 1');
  });

  // @scenario: worklog.feature > Běžící záznam se neexportuje
  it('běžící záznam vynechá — nemá konec, takže by ve sloupci trvání lhal', () => {
    const csv = exportedCsv([
      entry({ id: 'hotovy', title: 'Code review' }),
      entry({ id: 'bezici', title: 'Ladění importu', endedAt: undefined }),
    ]);

    expect(csv).toContain('Code review');
    expect(csv).not.toContain('Ladění importu');
    expect(csv).toContain('Počet záznamů: 1');
  });

  // @scenario: worklog.feature > Export uvádí trvání v hodinách i jako hh:mm
  it('trvání je zvlášť číslem a zvlášť čitelně', () => {
    const csv = exportedCsv([
      entry({
        id: 'a',
        title: 'Code review',
        startedAt: at('2026-03-02', '09:00'),
        endedAt: at('2026-03-02', '10:30'),
      }),
    ]);

    // 1,5 se sečte v Excelu, "1:30" se přečte očima.
    expect(csv).toContain('1.5');
    expect(csv).toContain('1:30');
  });
});
