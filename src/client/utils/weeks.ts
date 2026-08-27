import type { Week, WeekWithHolidays, MonthGroup, Milestone } from '../types';
import { MONTH_NAMES, MONTH_COLORS, HOLIDAY_NAMES } from '../constants';
import {
  toISO,
  parseLocalDate,
  addDays,
  weekMonday,
  czechHolidays,
  easterSunday,
  isWorkday,
} from './dates';

/** Svátky pro všechny roky, do kterých období zasahuje — počítají se jednou dopředu. */
function workdayPredicate(start: Date, end: Date): (d: Date) => boolean {
  const holidays = new Map<number, Set<string>>();
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    holidays.set(y, czechHolidays(y));
  }
  return (d) => isWorkday(d, holidays.get(d.getFullYear()) || new Set());
}

const fmtDate = (d: Date): string => `${d.getDate()}.${d.getMonth() + 1}`;

/** Počet pracovních dní mezi dvěma daty včetně. */
function countWorkdays(from: Date, to: Date, isWD: (d: Date) => boolean): number {
  let wd = 0;
  for (
    let d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d <= to;
    d = addDays(d, 1)
  ) {
    if (isWD(d)) wd++;
  }
  return wd;
}

/** „5.3–9" pro týden v jednom měsíci, „28.2–3.3" přes přelom měsíce. */
function weekLabel(labelStart: Date, actualEnd: Date): string {
  const sameMonth = labelStart.getMonth() === actualEnd.getMonth();
  return fmtDate(labelStart) + (sameMonth ? `–${actualEnd.getDate()}` : `–${fmtDate(actualEnd)}`);
}

/** Pořadí měsíce od začátku projektu (0-based). */
function monthIndex(labelStart: Date, start: Date): number {
  const diff =
    (labelStart.getFullYear() - start.getFullYear()) * 12 +
    labelStart.getMonth() -
    start.getMonth();
  return Math.max(0, diff);
}

/**
 * Compute weeks array for a project period
 */
export function computeWeeks(
  startISO: string,
  endISO: string,
  milestones: Milestone[] = []
): Week[] {
  if (!startISO || !endISO) return [];
  const start = parseLocalDate(startISO);
  const end = parseLocalDate(endISO);
  if (start > end) return [];

  // Mapa weekIndex → název milníku pro rychlé dohledání.
  const milestoneMap = new Map<number, string>();
  milestones.forEach((m) => {
    if (m.weekIndex >= 0) milestoneMap.set(m.weekIndex, m.title);
  });

  const isWD = workdayPredicate(start, end);
  const weeks: Week[] = [];
  let weekStart = weekMonday(start);
  let idx = 0;

  while (weekStart <= end) {
    const weekEnd = addDays(weekStart, 4); // pátek
    const actualEnd = weekEnd > end ? end : weekEnd;
    // První a poslední týden mohou začínat/končit uvnitř projektu.
    const labelStart = weekStart < start ? start : weekStart;

    weeks.push({
      w: idx + 1,
      label: weekLabel(labelStart, actualEnd),
      dl: milestoneMap.get(idx) || null,
      mIdx: monthIndex(labelStart, start),
      workdays: countWorkdays(labelStart, actualEnd, isWD),
      mondayISO: toISO(weekStart),
      fridayISO: toISO(actualEnd),
    });
    idx++;
    weekStart = addDays(weekStart, 7);
  }
  return weeks;
}

/**
 * Compute month groups from weeks array
 */
export function computeMonthGroups(weeks: Week[], startISO: string): MonthGroup[] {
  if (!weeks.length) return [];
  const groups: MonthGroup[] = [];
  let cur: MonthGroup | null = null;

  weeks.forEach((w) => {
    if (!cur || cur.mIdx !== w.mIdx) {
      const d = new Date(startISO);
      d.setMonth(d.getMonth() + w.mIdx);
      cur = {
        mIdx: w.mIdx,
        label: MONTH_NAMES[d.getMonth()],
        weeks: 0,
        color: MONTH_COLORS[d.getMonth()],
      };
      groups.push(cur);
    }
    cur.weeks++;
  });
  return groups;
}

/** Named státní svátky pro dané roky — mapa ISO datum → český název. */
function holidayNamesForYears(years: Set<number>): Map<string, string> {
  const named = new Map<string, string>();
  years.forEach((y) => {
    const es = easterSunday(y);
    const goodFridayISO = toISO(addDays(es, -2));
    const easterMondayISO = toISO(addDays(es, 1));
    czechHolidays(y).forEach((iso) => {
      const mmdd = iso.slice(5);
      let name = HOLIDAY_NAMES[mmdd] || 'Svátek';
      if (iso === goodFridayISO) name = 'Velký pátek';
      if (iso === easterMondayISO) name = 'Velikonoční pondělí';
      named.set(iso, name);
    });
  });
  return named;
}

/**
 * Rozšíří `weeks` o pojmenované svátky, které do daného týdne padnou
 * (ADR-005: zůstává na klientovi — deterministický výpočet nad kalendářem).
 */
export function computeWeeksWithHolidays(weeks: Week[]): WeekWithHolidays[] {
  if (!weeks.length) return [];
  const years = new Set(weeks.map((w) => parseLocalDate(w.mondayISO).getFullYear()));
  const named = holidayNamesForYears(years);

  return weeks.map((w) => {
    const holidays: { iso: string; name: string }[] = [];
    for (let d = parseLocalDate(w.mondayISO); d <= parseLocalDate(w.fridayISO); d = addDays(d, 1)) {
      const iso = toISO(d);
      const name = named.get(iso);
      if (name) holidays.push({ iso, name });
    }
    return { ...w, holidays };
  });
}
