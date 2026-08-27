// ── DATE UTILITIES ───────────────────────────────────────────────────────────

/**
 * Converts Date to ISO string (YYYY-MM-DD) using local date components
 */
export function toISO(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/**
 * Parse ISO string as LOCAL midnight (not UTC midnight)
 */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Add N days to a date
 */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Returns Monday of the week containing date d
 */
export function weekMonday(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}

/**
 * Calculate Easter Sunday for a given year using the Anonymous Gregorian algorithm
 */
export function easterSunday(y: number): Date {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31);
  const dy = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, dy);
}

/**
 * Returns a Set of ISO date strings for Czech public holidays in a given year
 */
export function czechHolidays(y: number): Set<string> {
  const fixed = [
    `${y}-01-01`,
    `${y}-05-01`,
    `${y}-05-08`,
    `${y}-07-05`,
    `${y}-07-06`,
    `${y}-09-28`,
    `${y}-10-28`,
    `${y}-11-17`,
    `${y}-12-24`,
    `${y}-12-25`,
    `${y}-12-26`,
  ];
  const sun = easterSunday(y);
  const gf = new Date(sun);
  gf.setDate(gf.getDate() - 2);
  const em = new Date(sun);
  em.setDate(em.getDate() + 1);
  return new Set([...fixed, toISO(gf), toISO(em)]);
}

/**
 * Check if a date is a workday (not weekend, not a Czech holiday)
 */
export function isWorkday(date: Date, holidays: Set<string>): boolean {
  const dow = date.getDay();
  return dow !== 0 && dow !== 6 && !holidays.has(toISO(date));
}

/**
 * Format period in Czech
 */
export function fmtPeriod(s: string, e: string): string {
  if (!s || !e) return '';
  const ds = new Date(s);
  const de = new Date(e);
  const M = [
    'ledna',
    'února',
    'března',
    'dubna',
    'května',
    'června',
    'července',
    'srpna',
    'září',
    'října',
    'listopadu',
    'prosince',
  ];
  if (ds.getFullYear() === de.getFullYear()) {
    return `${ds.getDate()}. ${M[ds.getMonth()]} – ${de.getDate()}. ${M[de.getMonth()]} ${de.getFullYear()}`;
  }
  return `${ds.getDate()}. ${M[ds.getMonth()]} ${ds.getFullYear()} – ${de.getDate()}. ${M[de.getMonth()]} ${de.getFullYear()}`;
}
