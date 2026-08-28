// Moje práce napříč projekty — načtení a rozpad do kalendářních týdnů.
//
// Server posílá úkoly s **reálnými datumy** (`fromIso`/`toIso`), ne s čísly
// týdnů: `Task.s`/`e` indexují do časové osy svého projektu (ADR-014), takže
// W5 v jednom projektu je jiný týden než W5 v druhém. Kapacitu server neposílá
// vůbec — závisí na českých svátcích, což je klientský výpočet (ADR-005).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyWorkload } from '../../api/workloadApi';
import type { MyTask } from '../../api/workloadApi';
import { addDays, czechHolidays, isWorkday, parseLocalDate, toISO, weekMonday } from '../../utils';

export interface WeekBucket {
  /** Pondělí týdne v ISO — klíč i popisek. */
  mondayIso: string;
  /** Pracovní dny týdne po odečtení českých svátků. */
  workdays: number;
  /** MD, které v tomhle týdnu na uživatele připadají ze všech projektů. */
  demand: number;
  tasks: MyTask[];
}

export interface MyWorkload {
  loading: boolean;
  error: string | null;
  staleAfterSeconds: number;
  /** Týdny od nejbližšího; prázdné týdny bez práce se vynechávají. */
  weeks: WeekBucket[];
  /** Úkoly bez rozsahu — projekt bez platných datumů. */
  undated: MyTask[];
  /** Pondělí aktuálního týdne — podle něj se týden v seznamu zvýrazní. */
  currentWeekIso: string;
  /** Týden, na kterém má obrazovka začít; `null`, když není kam scrollovat. */
  focusWeekIso: string | null;
  reload: () => void;
}

/** Pracovní dny v týdnu začínajícím `monday`, bez víkendů a českých svátků. */
function workdaysOfWeek(monday: Date): number {
  const holidays = czechHolidays(monday.getFullYear());
  const nextYear = czechHolidays(monday.getFullYear() + 1);
  let count = 0;
  for (let i = 0; i < 5; i++) {
    const day = addDays(monday, i);
    const forYear = day.getFullYear() === monday.getFullYear() ? holidays : nextYear;
    if (isWorkday(day, forYear)) count++;
  }
  return count;
}

/** Pondělky, do kterých úkol zasahuje. */
function weeksSpanned(task: MyTask): string[] {
  if (!task.fromIso || !task.toIso) return [];
  const first = weekMonday(parseLocalDate(task.fromIso));
  const last = weekMonday(parseLocalDate(task.toIso));
  const result: string[] = [];
  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 7)) {
    result.push(toISO(cursor));
    if (result.length > 520) break; // pojistka proti nesmyslným datům
  }
  return result;
}

/**
 * Rozpustí MD úkolů do kalendářních týdnů.
 *
 * MD se dělí **poměrně podle pracovních dnů**, stejně jako `useWeeklyLoad`
 * uvnitř projektu — zkrácený sváteční týden nesmí dostat stejnou porci jako
 * plný. Tady navíc přes projekty: právě proto, že člověk na třech projektech
 * po 100 % se v žádném z nich jako přetížený neukáže.
 */
function bucketize(tasks: MyTask[]): WeekBucket[] {
  const byWeek = new Map<string, WeekBucket>();

  const bucketFor = (mondayIso: string): WeekBucket => {
    const existing = byWeek.get(mondayIso);
    if (existing) return existing;
    const created: WeekBucket = {
      mondayIso,
      workdays: workdaysOfWeek(parseLocalDate(mondayIso)),
      demand: 0,
      tasks: [],
    };
    byWeek.set(mondayIso, created);
    return created;
  };

  for (const task of tasks) {
    const spanned = weeksSpanned(task);
    if (spanned.length === 0) continue;
    const buckets = spanned.map(bucketFor);
    const totalWorkdays = buckets.reduce((sum, bucket) => sum + bucket.workdays, 0);

    for (const bucket of buckets) {
      const share =
        totalWorkdays > 0 ? (task.md * bucket.workdays) / totalWorkdays : task.md / buckets.length;
      bucket.demand += share;
      bucket.tasks.push(task);
    }
  }

  return [...byWeek.values()]
    .map((bucket) => ({ ...bucket, demand: Math.round(bucket.demand * 10) / 10 }))
    .sort((a, b) => a.mondayIso.localeCompare(b.mondayIso));
}

/**
 * Týden, na kterém má obrazovka začít (FR-WORK-07).
 *
 * Seznam obsahuje i týdny, které už jsou za námi — úkol z minulého měsíce
 * v něm zůstává, dokud není hotový. Bez posunu by uživatel přistál na nejstarší
 * rozdělané práci a k dnešku by se musel prorolovat.
 *
 * Přednost má aktuální týden. Když v něm nic není, bere se nejbližší **příští**:
 * kdo se dívá na svou práci, dívá se dopředu. Až když je všechno v minulosti,
 * padne volba na poslední týden — i to je „nejblíž dnešku".
 *
 * Porovnává se jako řetězec, což u `yyyy-mm-dd` odpovídá porovnání dat.
 */
function focusWeek(weeks: WeekBucket[], currentWeekIso: string): string | null {
  if (weeks.length === 0) return null;
  const upcoming = weeks.find((week) => week.mondayIso >= currentWeekIso);
  return upcoming ? upcoming.mondayIso : weeks[weeks.length - 1].mondayIso;
}

export function useMyWorkload(): MyWorkload {
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [staleAfterSeconds, setStale] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // `version` je tu jako SPOUŠŤ pro ruční přenačtení, ne jako čtená hodnota —
  // efekt jeho obsah nikde nepoužívá.
  // biome-ignore lint/correctness/useExhaustiveDependencies: version je spoušť, viz komentář výše
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMyWorkload()
      .then((workload) => {
        if (cancelled) return;
        setTasks(workload.tasks);
        setStale(workload.staleAfterSeconds);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Přehled se nepodařilo načíst');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const weeks = useMemo(() => bucketize(tasks), [tasks]);
  const undated = useMemo(() => tasks.filter((task) => !task.fromIso), [tasks]);

  // Dnešek se čte jednou při připojení, ne při každém renderu: obrazovka je
  // krátkodobá a přeskočení půlnoci by jinak uprostřed práce přesunulo
  // zvýraznění pod rukama.
  const currentWeekIso = useMemo(() => toISO(weekMonday(new Date())), []);
  const focusWeekIso = useMemo(() => focusWeek(weeks, currentWeekIso), [weeks, currentWeekIso]);

  return {
    loading,
    error,
    staleAfterSeconds,
    weeks,
    undated,
    currentWeekIso,
    focusWeekIso,
    reload: useCallback(() => setVersion((value) => value + 1), []),
  };
}
