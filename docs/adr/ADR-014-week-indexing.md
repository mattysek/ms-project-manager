# ADR-014: Indexování týdnů — `Task.s`/`e` je 1-based, `Milestone.weekIndex` 0-based

## Status
Přijato

## Kontext

Časová osa projektu je pole týdnů (`Week[]`), které si klient dopočítá z
`startDate`/`endDate` (`utils/weeks.ts`, ADR-005). Do toho pole ukazují dvě
různé věci: rozsah úkolu (`Task.s`, `Task.e`) a pozice milníku
(`Milestone.weekIndex`).

Nikde nebylo napsáno, od kolika se počítá. Kód si to odvodil z okolí a odvodil
si to **třemi různými způsoby**:

| Místo | Konvence | Důkaz |
|---|---|---|
| `computeWeeks` | `Week.w = idx + 1` | `utils/weeks.ts` |
| `GanttBar` | 1-based | `left: (barS - 1) * CELL_W` |
| `useGanttDrag` | 1-based | ořez na `[1, numWeeks]` |
| Nový úkol | 1-based | `s: 1, e: 1` (`useTaskActions.ts`) |
| `useOverallocation` (Gantt) | 1-based | `weekAlloc[week.w - 1]`, `weeks[task.s - 1 + i]` |
| `useAutoWarnings` (Rizika) | 1-based | `t.s <= wIdx + 1 && t.e >= wIdx + 1` |
| **`useWeeklyLoad` (Kapacita)** | **0-based** | `first = Math.max(0, task.s)` |
| **`Weeks.maxIndex` (server)** | **0-based** | `max 0 (weekCount - 1)` |
| `Milestone.weekIndex` | 0-based | `milestoneMap.get(idx)` v `computeWeeks` |

Dvě poslední řádky nejsou stylová odchylka, jsou to dvě chyby, které uživatel
vidí:

- **Kapacita hlásila přetížení o týden vedle.** Úkol nakreslený v Ganttu v W4
  se do mřížky započítal jako W5 a `OverloadSummary` ten posunutý popisek
  i vypsal („první je W5"). Práce v posledním týdnu projektu z kontroly
  vypadla úplně, protože `Math.min(weeks.length - 1, task.e)` u `task.e =
  weekCount` vyrobí `last < first` a rozpad MD skončí prázdný.
- **Změna datumů posouvala úkoly.** `clampTask` ořezával na `weekCount - 1`,
  takže úkol v posledním týdnu se při **jakékoli** změně `startDate`/`endDate`
  tiše posunul o týden dopředu — a odešel jako `task_updated` diff, tedy se
  i uložil. Stačilo znovu uložit stejné datum.

Ani jedno nechytily testy. Unit test `useWeeklyLoad.test.ts` sdílel s kódem
tutéž chybnou konvenci — komentář „Úkol na jeden týden (W5)" stál nad
`s: 4, e: 4`. Je to stejná třída chyby, jakou v tomhle repozitáři řeší
kontraktní brány: obě strany se shodly samy se sebou.

## Rozhodnutí

**`Task.s` a `Task.e` jsou 1-based**, tedy `1` je první týden projektu
a `weekCount` je poslední platná hodnota. Do pole `Week[]` se indexuje
`weeks[task.s - 1]`.

**`Milestone.weekIndex` zůstává 0-based**, protože ho tak čte `computeWeeks`
i drag milníků a je uložený v datech existujících projektů.

Rozdíl mezi těmi dvěma je nepříjemný, ale zvolili jsme ho vědomě: obě
konvence už jsou v uložených datech a v exportech, takže sjednocení by
znamenalo migraci `state_json` u všech projektů kvůli kosmetice. Cena za to je
tenhle ADR a komentář u obou polí v `types/index.ts` a `Domain/Types.fs`.

### Co z toho plyne pro server

`Weeks.maxIndex` se jmenuje `maxWeek` a vrací `weekCount` (ne `weekCount - 1`).
Ořez úkolu do zkráceného projektu je `min task.S maxWeek`, dolní mez je `1`.
Projekt bez platných datumů má `weekCount = 0`; tam se neořezává vůbec, aby
úkoly nespadly na nulu a nezmizely z časové osy.

## Důsledky

- Kapacita, Gantt a Rizika odpovídají na otázku „kdo je kdy přetížený" stejně.
- Úkol v posledním týdnu přežije uložení datumů projektu.
- `useWeeklyLoad.test.ts` bylo potřeba opravit, ne rozšířit — jeho původní
  očekávání byla součástí chyby.
- Kdokoli píše nový výpočet nad časovou osou, má kam sáhnout. Konvence je
  navíc přímo u obou polí v komentáři, protože ADR nikdo nečte uprostřed
  psaní `useMemo`.

### Proč na to není brána

Brány v `build/` hlídají seams mezi dvěma stranami, které se můžou rozejít
nezávisle (protokol, REST, hub, entity). Tohle je jedna doména na dvou
stranách, ne dva nezávisle udržované seznamy — kontrola by musela rozumět
aritmetice, ne porovnávat jména. Roli brány tu hrají scénáře
`kapacita.feature > Přetížení sedí na stejném týdnu jako v Ganttu` a
`project-management.feature > Úkol v posledním týdnu přežije uložení datumů`,
které selžou právě na posunu o jedna.
