/// Počet týdnů projektu.
///
/// Server nepotřebuje `Week[]` ani české svátky (to zůstává na klientovi,
/// ADR-005) — jen kolik týdnů se mezi dvě data vejde, aby uměl po změně
/// datumů oříznout `S`/`E` úkolů a délku `WeekAlloc` (ADR-004, doplněk).
/// Musí přitom počítat stejně jako `computeWeeks` v `src/utils/weeks.ts`:
/// týdny začínají pondělkem toho týdne, do kterého padá začátek projektu.
module MSProjectManager.Domain.Weeks

open System
open System.Globalization

let private tryParseIso (value: string) =
    match DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None) with
    | true, parsed -> Some parsed
    | false, _ -> None

/// Pondělí týdne, do kterého datum spadá.
let mondayOf (date: DateTime) =
    let offset =
        match date.DayOfWeek with
        | DayOfWeek.Sunday -> 6
        | day -> int day - 1

    date.AddDays(float -offset)

/// Počet týdnů mezi datumy projektu; prázdná nebo obrácená data dávají nulu.
let count (startDate: string) (endDate: string) =
    match tryParseIso startDate, tryParseIso endDate with
    | Some start, Some finish when start <= finish ->
        let monday = mondayOf start
        int (finish - monday).TotalDays / 7 + 1
    | _ -> 0

/// Nejvyšší platné číslo týdne. `S`/`E` úkolu jsou 1-based (ADR-014), takže
/// poslední platný týden je `weekCount`, ne `weekCount - 1` — dokud to tady
/// bylo o jedna míň, posunula každá změna datumů úkoly z posledního týdne
/// o týden dopředu a odeslala to jako `task_updated`.
///
/// Projekt bez platných datumů dává nulu; `clampTask` na ni nesahá, aby se
/// úkoly neořízly na neplatný týden 0.
let maxWeek (weekCount: int) = max 0 weekCount

/// Natáhne nebo zkrátí alokaci na počet týdnů projektu; chybějící týdny jsou
/// 100 %, stejnou výchozí hodnotu používá i frontend.
///
/// `weekCount = 0` znamená „datumy nejdou přečíst", ne „projekt má nula
/// týdnů" — stejně jako u `maxWeek`. Alokaci pak necháváme být: dorovnání na
/// nulu by ji smazalo, a protože další nastavení datumů ji vrátí jako samé
/// stovky, zmizelo by rozdělení kapacit bez jediné hlášky.
let fitAlloc (weekCount: int) (alloc: float list) =
    if weekCount <= 0 then
        alloc
    else
        List.init
            weekCount
            (fun index ->
                match List.tryItem index alloc with
                | Some value -> value
                | None -> 100.0
            )

/// Pondělí `week`-tého týdne projektu (1-based, ADR-014) jako ISO datum.
///
/// Zrcadlí `computeWeeks` na klientovi: týdny začínají pondělkem toho týdne,
/// do kterého padá začátek projektu. Přehled napříč projekty musí čísla týdnů
/// převést na kalendářní data — W5 v jednom projektu je jiný týden než W5
/// v druhém, protože každý projekt začíná jinde.
let weekStartIso (startDate: string) (week: int) =
    match tryParseIso startDate with
    | None -> None
    | Some start -> Some((mondayOf start).AddDays(float ((week - 1) * 7)).ToString "yyyy-MM-dd")

/// Pátek téhož týdne — konec pracovního týdne, na kterém stojí `Week.fridayISO`.
let weekEndIso (startDate: string) (week: int) =
    match tryParseIso startDate with
    | None -> None
    | Some start -> Some((mondayOf start).AddDays(float ((week - 1) * 7 + 4)).ToString "yyyy-MM-dd")
