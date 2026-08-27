// Doplní ke každému týdnu jeho státní svátky (pro sloupec „Svátky" v přehledu).
import { useMemo } from 'react';
import type { Week, WeekWithHolidays } from '../../../types';
import { HOLIDAY_NAMES } from '../../../constants';
import { parseLocalDate, toISO, addDays, czechHolidays, easterSunday } from '../../../utils';

/** Mapa `ISO → název svátku` pro všechny roky, do kterých projekt zasahuje. */
function holidayNamesForYears(years: Set<number>): Map<string, string> {
  const all = new Map<string, string>();
  years.forEach((y) => {
    const es = easterSunday(y);
    const gfISO = toISO(addDays(es, -2));
    const emISO = toISO(addDays(es, 1));
    czechHolidays(y).forEach((iso) => {
      let name = HOLIDAY_NAMES[iso.slice(5)] || 'Svátek';
      if (iso === gfISO) name = 'Velký pátek';
      if (iso === emISO) name = 'Velikonoční pondělí';
      all.set(iso, name);
    });
  });
  return all;
}

/** Svátky spadající do jednoho týdne (pondělí–pátek včetně). */
function holidaysInWeek(week: Week, named: Map<string, string>) {
  const hols: { iso: string; name: string }[] = [];
  // Data jako lokální půlnoc (`parseLocalDate`), ne `new Date(iso)` — ten je UTC.
  for (
    let d = parseLocalDate(week.mondayISO);
    d <= parseLocalDate(week.fridayISO);
    d = addDays(d, 1)
  ) {
    const iso = toISO(d);
    const holidayName = named.get(iso);
    if (holidayName !== undefined) hols.push({ iso, name: holidayName });
  }
  return hols;
}

export function useWeeksWithHolidays(weeks: Week[]): WeekWithHolidays[] {
  return useMemo(() => {
    if (!weeks.length) return [];
    const years = new Set(weeks.map((w) => parseLocalDate(w.mondayISO).getFullYear()));
    const named = holidayNamesForYears(years);
    return weeks.map((w) => ({ ...w, holidays: holidaysInWeek(w, named) }));
  }, [weeks]);
}
