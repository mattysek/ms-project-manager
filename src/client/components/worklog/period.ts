// Volba období pro seznam i přehled výkazů (PRD-10, FR-WL-07).
//
// Období se drží jako **místní dny** (`YYYY-MM-DD`), ne jako instanty: uživatel
// vybírá „únor", ne „od 2026-01-31T23:00Z". Na instanty se převádí až těsně
// před dotazem na server, a to přes místní půlnoc — jinak by se do února
// připletl poslední lednový večer.

export type PeriodKind = 'week' | 'month' | 'last30' | 'custom';

export interface Period {
  kind: PeriodKind;
  /** Místní den, včetně. */
  fromDay: string;
  /** Místní den, včetně. */
  toDay: string;
}

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  week: 'Tento týden',
  month: 'Tento měsíc',
  last30: 'Posledních 30 dní',
  custom: 'Vlastní rozsah',
};

function toDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function shifted(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Pondělí týdne, ve kterém `date` leží — týden začíná v pondělí, ne v neděli. */
function mondayOf(date: Date): Date {
  const weekday = (date.getDay() + 6) % 7;
  return shifted(date, -weekday);
}

export function makePeriod(kind: Exclude<PeriodKind, 'custom'>, today: Date): Period {
  if (kind === 'week') {
    const monday = mondayOf(today);
    return { kind, fromDay: toDayKey(monday), toDay: toDayKey(shifted(monday, 6)) };
  }
  if (kind === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { kind, fromDay: toDayKey(first), toDay: toDayKey(last) };
  }
  return { kind, fromDay: toDayKey(shifted(today, -29)), toDay: toDayKey(today) };
}

/**
 * Období na rozsah instantů pro `GET /api/worklog`.
 *
 * Horní mez je **půlnoc následujícího dne**, protože server filtruje
 * polootevřeným intervalem `[from, to)`. Bez toho posunu by z posledního dne
 * období vypadlo všechno kromě záznamu přesně o půlnoci.
 */
export function periodRange(period: Period): { from: string; to: string } {
  const from = new Date(`${period.fromDay}T00:00:00`);
  const to = new Date(`${period.toDay}T00:00:00`);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Popisek období do hlavičky exportu a nad statistiky. */
export function describePeriod(period: Period): string {
  const czech = (day: string) => day.split('-').reverse().join('. ');
  return `${czech(period.fromDay)} – ${czech(period.toDay)}`;
}
