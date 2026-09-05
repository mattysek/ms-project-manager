// Odvozená data nad výkazy (PRD-10). Čisté funkce, takže se tu dá otestovat
// přesně to, co je na statistikách nejkřehčí — čím se dělí průměr a co se
// stane s prázdným obdobím.
import { describe, expect, it } from 'vitest';
import type { WorkLogEntry } from '../api/worklogApi';
import {
  NO_PROJECT_LABEL,
  byProject,
  byTag,
  computeStats,
  dailySeries,
  durationMs,
  filterEntries,
  formatDuration,
  groupByDay,
  toHours,
} from './worklog';

/**
 * Časy se skládají z **místního** data a hodiny a hned se převedou na instant,
 * takže test nezávisí na časové zóně, ve které běží — a zároveň jede přesně
 * tou cestou, kterou jede aplikace.
 */
function at(day: string, time: string): string {
  return new Date(`${day}T${time}:00`).toISOString();
}

function entry(overrides: Partial<WorkLogEntry> & { id: string }): WorkLogEntry {
  return {
    title: 'Práce',
    description: '',
    startedAt: at('2026-03-02', '09:00'),
    endedAt: at('2026-03-02', '10:00'),
    tags: [],
    createdAt: at('2026-03-02', '09:00'),
    updatedAt: at('2026-03-02', '09:00'),
    ...overrides,
  };
}

const NOW = new Date(`2026-03-04T12:00:00`).getTime();

describe('trvání', () => {
  it('formátuje hodiny a minuty', () => {
    expect(formatDuration(90 * 60_000)).toBe('1:30');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5 * 60_000)).toBe('0:05');
  });

  it('hodiny jako číslo jdou sečíst v Excelu', () => {
    expect(toHours(90 * 60_000)).toBe(1.5);
  });

  // @scenario: worklog.feature > Běžící činnost se počítá k okamžiku zobrazení
  it('běžící záznam se počítá k `now`', () => {
    const running = entry({
      id: 'r',
      startedAt: new Date(NOW - 45 * 60_000).toISOString(),
      endedAt: undefined,
    });

    expect(formatDuration(durationMs(running, NOW))).toBe('0:45');
  });
});

describe('seskupení po dnech', () => {
  // @scenario: worklog.feature > Záznamy jsou seskupené po dnech s mezisoučtem
  it('sečte den ze všech jeho záznamů', () => {
    const groups = groupByDay(
      [
        entry({
          id: 'a',
          startedAt: at('2026-03-02', '09:00'),
          endedAt: at('2026-03-02', '11:00'),
        }),
        entry({
          id: 'b',
          startedAt: at('2026-03-02', '13:00'),
          endedAt: at('2026-03-02', '14:30'),
        }),
        entry({
          id: 'c',
          startedAt: at('2026-03-03', '09:00'),
          endedAt: at('2026-03-03', '10:00'),
        }),
      ],
      NOW
    );

    expect(groups.map((group) => group.day)).toEqual(['2026-03-03', '2026-03-02']);
    expect(formatDuration(groups[1].totalMs)).toBe('3:30');
  });

  it('den se určuje v místním čase, ne v UTC', () => {
    // 23:30 místního času je v UTC už zítřek (v CET i CEST) — seskupení
    // podle `toISOString()` by tenhle záznam přehodilo na další den.
    const late = entry({
      id: 'late',
      startedAt: at('2026-03-02', '23:30'),
      endedAt: at('2026-03-02', '23:50'),
    });

    expect(groupByDay([late], NOW)[0].day).toBe('2026-03-02');
  });
});

describe('statistiky', () => {
  // @scenario: worklog.feature > Průměr na den počítá jen dny, ve kterých něco je
  it('dělí počtem dnů se záznamem, ne dny období', () => {
    const stats = computeStats(
      [
        entry({
          id: 'po',
          startedAt: at('2026-03-02', '08:00'),
          endedAt: at('2026-03-02', '16:00'),
        }),
        entry({
          id: 'st',
          startedAt: at('2026-03-04', '08:00'),
          endedAt: at('2026-03-04', '12:00'),
        }),
      ],
      NOW
    );

    // 12 hodin ve dvou dnech se záznamem = 6:00. Kdyby se dělilo úterkem
    // (den bez záznamu) nebo celým týdnem, vyšlo by 4:00, resp. 1:42.
    expect(formatDuration(stats.totalMs)).toBe('12:00');
    expect(stats.daysWithWork).toBe(2);
    expect(formatDuration(stats.averagePerDayMs)).toBe('6:00');
    expect(formatDuration(stats.longestDayMs)).toBe('8:00');
  });

  // @scenario: worklog.feature > Prázdné období nehlásí dělení nulou
  it('prázdné období vrací nuly, ne NaN', () => {
    const stats = computeStats([], NOW);

    expect(stats.averagePerDayMs).toBe(0);
    expect(stats.averageEntryMs).toBe(0);
    expect(formatDuration(stats.averagePerDayMs)).toBe('0:00');
    expect(Number.isNaN(stats.averagePerDayMs)).toBe(false);
  });
});

describe('rozpady', () => {
  // @scenario: worklog.feature > Rozpad podle projektů pojmenuje záznamy bez projektu
  it('záznam bez projektu má vlastní díl, nezmizí', () => {
    const slices = byProject(
      [
        entry({ id: 'a', projectId: 'p1' }),
        entry({
          id: 'b',
          startedAt: at('2026-03-02', '11:00'),
          endedAt: at('2026-03-02', '13:00'),
        }),
      ],
      NOW,
      new Map([['p1', 'Backend refaktoring']])
    );

    expect(slices.map((slice) => slice.label)).toContain(NO_PROJECT_LABEL);
    expect(slices.map((slice) => slice.label)).toContain('Backend refaktoring');
  });

  // @scenario: worklog.feature > Rozpad podle tagů sečte čas každého tagu
  it('záznam se dvěma tagy se počítá do obou', () => {
    const slices = byTag([entry({ id: 'a', tags: ['pohotovost', 'víkend'] })], NOW);

    expect(slices).toHaveLength(2);
    for (const slice of slices) expect(formatDuration(slice.ms)).toBe('1:00');
  });
});

describe('řada pro graf', () => {
  // @scenario: worklog.feature > Graf má sloupec i pro den bez práce
  it('den bez záznamu zůstává v řadě s nulou', () => {
    const points = dailySeries(
      [
        entry({
          id: 'po',
          startedAt: at('2026-03-02', '09:00'),
          endedAt: at('2026-03-02', '10:00'),
        }),
        entry({
          id: 'st',
          startedAt: at('2026-03-04', '09:00'),
          endedAt: at('2026-03-04', '10:00'),
        }),
      ],
      NOW,
      { fromDay: '2026-03-02', toDay: '2026-03-04' }
    );

    // Bez úterý s nulou by graf nakreslil pondělí a středu vedle sebe
    // a tvrdil, že se pracovalo dva dny v řadě.
    expect(points.map((point) => point.day)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04']);
    expect(points[1].ms).toBe(0);
  });
});

describe('filtr', () => {
  const entries = [
    entry({ id: 'a', title: 'Code review', description: 'PR 412', tags: ['review'] }),
    entry({ id: 'b', title: 'Noční zásah', tags: ['pohotovost'], projectId: 'p1' }),
  ];

  // @scenario: worklog.feature > Filtr podle tagu
  it('podle tagu, bez ohledu na velikost písmen', () => {
    const found = filterEntries(entries, { projectId: '', tag: 'Pohotovost', search: '' });
    expect(found.map((item) => item.id)).toEqual(['b']);
  });

  // @scenario: worklog.feature > Hledání v názvu i popisu
  it('hledá v názvu i v popisu', () => {
    expect(filterEntries(entries, { projectId: '', tag: '', search: '412' })).toHaveLength(1);
    expect(filterEntries(entries, { projectId: '', tag: '', search: 'noční' })).toHaveLength(1);
  });

  it('podle projektu', () => {
    const found = filterEntries(entries, { projectId: 'p1', tag: '', search: '' });
    expect(found.map((item) => item.id)).toEqual(['b']);
  });
});
