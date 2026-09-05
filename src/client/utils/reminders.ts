// Pomocné výpočty pro opakující se připomínky (TODO/Reminders view).
//
// ADR-005: podobně jako české svátky/pracovní dny v `dates.ts`, i výpočet
// dalšího výskytu opakující se připomínky je čistý klientský výpočet — server
// drží jen `startDate`/`recurrence`/`lastCompleted`/`enabled` (viz
// `RecurringReminder` v `types/index.ts`), nic odvozeného.
import { addDays, parseLocalDate } from './dates';
import type { RecurrenceType, RecurringReminder } from '../types';

const INTERVAL_DAYS: Record<'weekly' | 'biweekly', number> = { weekly: 7, biweekly: 14 };

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Posune datum o jeden interval opakování dopředu — měsíční je kalendářní měsíc, ne 30 dní. */
export function advanceOccurrence(date: Date, recurrence: RecurrenceType): Date {
  if (recurrence === 'monthly') {
    const next = new Date(date);
    next.setMonth(next.getMonth() + 1);
    return next;
  }
  return addDays(date, INTERVAL_DAYS[recurrence]);
}

/** Počet dní v měsíci — den 0 dalšího měsíce je poslední den toho hledaného. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * `index`-tý výskyt rozvrhu, počítáno od data zahájení (0 = první).
 *
 * Rozvrh se **nepočítá opakovaným posouváním**, ale přímo z `startDate`, aby
 * se nesčítala chyba: měsíční připomínka od 31. 1. by přes `setMonth` skočila
 * na 3. 3. (únor přeteče), z toho na 3. 4. a dál už by běžela na třetím dni
 * v měsíci. Den se proto ořízne na délku cílového měsíce — 31. 1. → 28. 2. →
 * 31. 3.
 */
export function occurrenceAt(reminder: RecurringReminder, index: number): Date {
  const start = parseLocalDate(reminder.startDate);
  if (reminder.recurrence !== 'monthly') {
    return addDays(start, index * INTERVAL_DAYS[reminder.recurrence]);
  }
  const year = start.getFullYear();
  const month = start.getMonth() + index;
  const target = new Date(year, month, 1);
  const day = Math.min(start.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
  return new Date(target.getFullYear(), target.getMonth(), day);
}

/** Pojistka proti nekonečné smyčce u nesmyslných dat (rok 1900 apod.). */
const MAX_OCCURRENCES = 500;

/**
 * Nejbližší **nesplněný** výskyt.
 *
 * Odpočítává se od rozvrhu, ne od data odškrtnutí. Dřív se další výskyt
 * počítal jako `lastCompleted + interval`, takže týdenní připomínka na pondělní
 * status odškrtnutá ve středu se natrvalo přestěhovala na středu — a s každým
 * dalším zpožděním se posunula znovu. Rozvrh přitom nikdo neměnil: měsíční
 * přehled (`occurrencesInMonth`) pořád ukazoval pondělky, takže si dvě části
 * téhle obrazovky odporovaly.
 *
 * `lastCompleted` je proto značka „výskyty do tohoto dne včetně jsou hotové",
 * ne nový počátek. Zmeškané výskyty se nepřeskakují: vrátí se ten nejstarší
 * nesplněný, tedy datum v minulosti, a připomínka je po termínu.
 */
export function nextOccurrence(reminder: RecurringReminder): Date {
  const completed = reminder.lastCompleted
    ? startOfDay(parseLocalDate(reminder.lastCompleted))
    : null;
  if (!completed) return occurrenceAt(reminder, 0);

  for (let index = 0; index < MAX_OCCURRENCES; index++) {
    const occurrence = occurrenceAt(reminder, index);
    if (startOfDay(occurrence) > completed) return occurrence;
  }
  // Rozvrh je celý v minulosti (dlouho neodškrtnutá připomínka s krátkým
  // intervalem) — pak je „další" ten za posledním známým.
  return advanceOccurrence(occurrenceAt(reminder, MAX_OCCURRENCES - 1), reminder.recurrence);
}

/** Připomínka je splatná (dnes nebo v minulosti) a zapnutá. */
export function isReminderDue(reminder: RecurringReminder, today: Date): boolean {
  if (!reminder.enabled) return false;
  return startOfDay(nextOccurrence(reminder)) <= startOfDay(today);
}

/** Rozdíl ve dnech mezi `target` a `today` (kladný = v budoucnu). */
export function daysUntil(target: Date, today: Date): number {
  const ms = startOfDay(target).getTime() - startOfDay(today).getTime();
  return Math.round(ms / 86_400_000);
}

/** „za N dní/dny/den", „dnes" nebo „po termínu" — český popisek odpočtu. */
export function relativeDaysLabel(days: number): string {
  if (days === 0) return 'dnes';
  if (days < 0) return 'po termínu';
  if (days === 1) return 'za 1 den';
  if (days <= 4) return `za ${days} dny`;
  return `za ${days} dní`;
}

/** D.M.YYYY bez vodicích nul — český formát krátkého data. */
export function formatCzechDateObj(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

/** D.M.YYYY z ISO řetězce (`YYYY-MM-DD`) — viz `formatCzechDateObj`. */
export function formatCzechDate(iso: string): string {
  return formatCzechDateObj(parseLocalDate(iso));
}

/** D.M. (bez roku) — pro přehled výskytů v rámci jednoho měsíce. */
export function formatCzechDayMonth(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

/** Popisky pro select při editaci — slovní tvar („Každé dva týdny"). */
export const RECURRENCE_SELECT_LABELS: Record<RecurrenceType, string> = {
  weekly: 'Každý týden',
  biweekly: 'Každé dva týdny',
  monthly: 'Každý měsíc',
};

/** Popisky pro zobrazení uložené připomínky — biweekly číslicí („Každé 2 týdny"). */
const RECURRENCE_DISPLAY_LABELS: Record<RecurrenceType, string> = {
  weekly: 'Každý týden',
  biweekly: 'Každé 2 týdny',
  monthly: 'Každý měsíc',
};

/** „Každý týden od 17.8.2026" — souhrn opakování + data zahájení. */
export function recurrenceSummary(reminder: RecurringReminder): string {
  return `${RECURRENCE_DISPLAY_LABELS[reminder.recurrence]} od ${formatCzechDate(reminder.startDate)}`;
}

/**
 * Všechny výskyty připomínky v daném kalendářním měsíci (`month` 0-based),
 * seřazené vzestupně — nezávisle na `lastCompleted` (jde o rozvrh, ne o stav
 * plnění).
 *
 * Staví na stejném `occurrenceAt` jako `nextOccurrence`, takže přehled i
 * odpočet mluví o týchž datech. Dokud každá strana počítala po svém, ukazoval
 * přehled rozvrh od data zahájení a odpočet posunutý o zpoždění odškrtnutí.
 */
export function occurrencesInMonth(
  reminder: RecurringReminder,
  year: number,
  month: number
): Date[] {
  const result: Date[] = [];
  for (let index = 0; index < MAX_OCCURRENCES; index++) {
    const occurrence = occurrenceAt(reminder, index);
    const occurrenceYear = occurrence.getFullYear();
    const occurrenceMonth = occurrence.getMonth();
    if (occurrenceYear > year || (occurrenceYear === year && occurrenceMonth > month)) break;
    if (occurrenceYear === year && occurrenceMonth === month) result.push(occurrence);
  }
  return result;
}
