// Odvozená data nad výkazy: trvání, seskupení po dnech, statistiky, podklady
// pro grafy (PRD-10). Čisté funkce beze stavu — server posílá jen fakta
// (co, odkdy, dokdy) a všechno ostatní vzniká tady (ADR-017).
//
// **Den je hranice v místním čase.** Instanty ze serveru jsou v UTC, takže se
// musí převést, než se podle nich cokoli seskupí; jinak by práce po 22:00
// v létě spadla na zítřek. `new Date(iso)` je tu proto správně a nutně — na
// rozdíl od datumů projektu, kde se čte jen datum bez času a používá se
// `parseLocalDate` (`utils/dates.ts`).
import type { WorkLogEntry } from '../api/worklogApi';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

/** Popisek pro záznam bez projektu — nesmí zmizet, jen se nejmenuje (FR-WL-08). */
export const NO_PROJECT_LABEL = 'Bez projektu';

/** Jeden díl rozpadu (projekt, tag) i s podílem na celku. */
export interface Slice {
  key: string;
  label: string;
  ms: number;
  /** Podíl 0–1 vůči největšímu dílu; graf z něj kreslí délku pruhu. */
  ratio: number;
}

export interface DayGroup {
  /** `YYYY-MM-DD` v místním čase. */
  day: string;
  entries: WorkLogEntry[];
  totalMs: number;
}

export interface WorkLogStats {
  totalMs: number;
  /** Dny, ve kterých je aspoň jeden záznam — jmenovatel průměru (ADR-017). */
  daysWithWork: number;
  averagePerDayMs: number;
  longestDayMs: number;
  entryCount: number;
  averageEntryMs: number;
}

export function isRunning(entry: WorkLogEntry): boolean {
  return !entry.endedAt;
}

/**
 * Trvání záznamu. Běžící se počítá k `now`, takže se přehled i seznam hýbou
 * spolu s ním (FR-WL-08).
 */
export function durationMs(entry: WorkLogEntry, now: number): number {
  const start = new Date(entry.startedAt).getTime();
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now;
  return Math.max(0, end - start);
}

/** `5400000` → `"1:30"`. Vteřiny se zahazují — výkaz se čte po minutách. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / MS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

/** Trvání v hodinách zaokrouhlené na dvě místa — sloupec, který jde v Excelu sečíst. */
export function toHours(ms: number): number {
  return Math.round((ms / MS_PER_HOUR) * 100) / 100;
}

/** `YYYY-MM-DD` **v místním čase**; `toISOString().slice(0,10)` by tu lhalo o zónu. */
export function localDayKey(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Čas `HH:MM` v místním čase. */
export function localTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Záznamy po dnech, od nejnovějšího dne; uvnitř dne od nejnovějšího záznamu. */
export function groupByDay(entries: WorkLogEntry[], now: number): DayGroup[] {
  const byDay = new Map<string, WorkLogEntry[]>();
  for (const entry of entries) {
    const key = localDayKey(entry.startedAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, dayEntries]) => ({
      day,
      entries: [...dayEntries].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      totalMs: dayEntries.reduce((sum, entry) => sum + durationMs(entry, now), 0),
    }));
}

/**
 * Souhrn nad zvoleným obdobím.
 *
 * `averagePerDayMs` dělí **počtem dnů, ve kterých něco je** — ne kalendářními
 * ani pracovními dny období (ADR-017). Odpovídá na „když pracuju, kolik toho
 * odpracuju"; obrazovka to musí u čísla napsat, jinak si ho každý přečte jinak.
 */
export function computeStats(entries: WorkLogEntry[], now: number): WorkLogStats {
  const days = groupByDay(entries, now);
  const totalMs = days.reduce((sum, group) => sum + group.totalMs, 0);
  const daysWithWork = days.length;

  return {
    totalMs,
    daysWithWork,
    averagePerDayMs: daysWithWork === 0 ? 0 : totalMs / daysWithWork,
    longestDayMs: days.reduce((max, group) => Math.max(max, group.totalMs), 0),
    entryCount: entries.length,
    averageEntryMs: entries.length === 0 ? 0 : totalMs / entries.length,
  };
}

/** Seřadí od největšího a dopočítá podíl vůči nejvyšší hodnotě. */
function toSlices(totals: Map<string, { label: string; ms: number }>): Slice[] {
  const rows = [...totals.entries()].sort(([, a], [, b]) => b.ms - a.ms);
  const largest = rows.reduce((max, [, value]) => Math.max(max, value.ms), 0);

  return rows.map(([key, value]) => ({
    key,
    label: value.label,
    ms: value.ms,
    ratio: largest === 0 ? 0 : value.ms / largest,
  }));
}

function accumulate(
  totals: Map<string, { label: string; ms: number }>,
  key: string,
  label: string,
  ms: number
): void {
  const current = totals.get(key);
  if (current) current.ms += ms;
  else totals.set(key, { label, ms });
}

/** Rozpad podle projektů; záznamy bez projektu mají vlastní díl, nemizí. */
export function byProject(
  entries: WorkLogEntry[],
  now: number,
  projectNames: Map<string, string>
): Slice[] {
  const totals = new Map<string, { label: string; ms: number }>();
  for (const entry of entries) {
    const key = entry.projectId ?? '';
    const label = entry.projectId
      ? (projectNames.get(entry.projectId) ?? entry.projectId)
      : NO_PROJECT_LABEL;
    accumulate(totals, key, label, durationMs(entry, now));
  }
  return toSlices(totals);
}

/**
 * Rozpad podle tagů. Záznam se dvěma tagy se počítá do obou, takže součet
 * dílů může být větší než odpracovaný čas — obrazovka to nesmí vydávat za
 * rozdělení celku.
 */
export function byTag(entries: WorkLogEntry[], now: number): Slice[] {
  const totals = new Map<string, { label: string; ms: number }>();
  for (const entry of entries) {
    const ms = durationMs(entry, now);
    for (const tag of entry.tags) accumulate(totals, tag.toLowerCase(), tag, ms);
  }
  return toSlices(totals);
}

export interface DayPoint {
  day: string;
  ms: number;
}

/**
 * Odpracovaný čas po dnech přes celé období — **včetně dnů bez práce**.
 *
 * Nula musí ve sloupcovém grafu zůstat viditelnou mezerou; bez ní by se
 * pondělí a středa nakreslily vedle sebe a graf by tvrdil, že se pracovalo
 * dva dny v řadě.
 */
export function dailySeries(
  entries: WorkLogEntry[],
  now: number,
  period: { fromDay: string; toDay: string }
): DayPoint[] {
  const totals = new Map(groupByDay(entries, now).map((group) => [group.day, group.totalMs]));
  const points: DayPoint[] = [];
  const cursor = new Date(`${period.fromDay}T00:00:00`);
  const last = new Date(`${period.toDay}T00:00:00`);

  while (cursor <= last) {
    const key = localDayKey(cursor.toISOString());
    points.push({ day: key, ms: totals.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

export interface WorkLogFilter {
  /** Prázdné = bez omezení. */
  projectId: string;
  tag: string;
  search: string;
}

export const EMPTY_FILTER: WorkLogFilter = { projectId: '', tag: '', search: '' };

function matchesSearch(entry: WorkLogEntry, needle: string): boolean {
  const text = `${entry.title} ${entry.description}`.toLowerCase();
  return text.includes(needle);
}

/** Filtr seznamu; období řeší dotaz na server, tohle je až nad staženými daty. */
export function filterEntries(entries: WorkLogEntry[], filter: WorkLogFilter): WorkLogEntry[] {
  const needle = filter.search.trim().toLowerCase();
  const tag = filter.tag.toLowerCase();

  return entries.filter((entry) => {
    if (filter.projectId && entry.projectId !== filter.projectId) return false;
    if (tag && !entry.tags.some((value) => value.toLowerCase() === tag)) return false;
    return !needle || matchesSearch(entry, needle);
  });
}

/**
 * ISO instant → hodnota pro `<input type="datetime-local">` (místní čas).
 *
 * `toISOString().slice(0,16)` je tu klasická past: vrátí UTC, takže by
 * formulář ukazoval jiný čas, než jaký uživatel před chvílí naklikal.
 */
export function toLocalInputValue(iso: string): string {
  return `${localDayKey(iso)}T${localTime(iso)}`;
}

/** Hodnota z `datetime-local` (místní čas) → ISO instant pro server. */
export function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString();
}
