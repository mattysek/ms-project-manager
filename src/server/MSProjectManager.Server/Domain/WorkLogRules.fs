/// Pravidla vykazování práce — čistá část, bez databáze (PRD-10, ADR-017).
///
/// Odděleno od `Persistence.Repositories.WorkLog` schválně: tohle jsou
/// rozhodnutí o tom, co je platný záznam, a nemají s uložením nic společného.
/// Sedí to i na vrstvení serveru — `Domain/` je čisté jádro, stejně jako
/// `Weeks.fs`, ze kterého čte REST projekce.
///
/// Klíčové rozhodnutí, ze kterého tenhle modul vyrostl: **časy posílá klient,
/// server je jen validuje.** Uživatel je musí umět ručně opravit (FR-WL-04),
/// takže server na ně stejně není autorita; jeho úkolem je odmítnout nesmysl
/// a uložit je v kanonickém tvaru.
module MSProjectManager.Domain.WorkLogRules

open System

[<Literal>]
let MaxTitleLength = 200

[<Literal>]
let MaxDescriptionLength = 4000

[<Literal>]
let MaxTags = 10

[<Literal>]
let MaxTagLength = 32

/// Řádově dvacet let denního vykazování. Limit není proti uživateli, ale
/// proti tomu, aby se z tabulky stalo úložiště strojových logů.
[<Literal>]
let MaxEntriesPerUser = 20000

/// Delší úsek je skoro jistě zapomenuté stopky (FR-WL-01) a rozhodil by
/// každý průměr.
[<Literal>]
let MaxDurationHours = 24.0

/// Tolerance na rozjetý čas prohlížeče. Bez ní by uživatel se špatně
/// seřízenými hodinami nezapsal vůbec nic.
[<Literal>]
let FutureToleranceMinutes = 60.0

/// Pole, která podléhají validaci. `Id`, vlastník a projekt sem nepatří —
/// o těch nerozhoduje tvar dat, ale vlastnictví.
type WorkLogFields =
    {
        Title: string
        Description: string
        Tags: string list
        StartedAt: string
        /// `None` = běžící činnost.
        EndedAt: string option
    }

/// Ověřený a do kanonického tvaru převedený obsah záznamu.
type Validated =
    {
        Title: string
        Description: string
        StartedAt: string
        EndedAt: string option
        /// Tagy jako JSON pole — tak, jak jdou do jednoho sloupce.
        TagsJson: string
    }

// ── Čas ─────────────────────────────────────────────────────────────────────

/// Kanonický tvar času: UTC v `o` formátu, stejně jako `Common.Clock.nowIso`.
///
/// Pevná šířka je tu funkční požadavek, ne úhlednost — rozsahy se filtrují
/// a řadí porovnáním **textu** ve sloupci, takže pomíchané offsety
/// (`+02:00` vs `Z`) by rozbily řazení, aniž by cokoli spadlo.
let canonicalTime (value: string) : Result<DateTimeOffset * string, string> =
    match
        DateTimeOffset.TryParse(
            value,
            Globalization.CultureInfo.InvariantCulture,
            Globalization.DateTimeStyles.RoundtripKind
        )
    with
    | true, parsed ->
        let utc = parsed.ToUniversalTime()
        Ok(utc, utc.ToString("o", Globalization.CultureInfo.InvariantCulture))
    | _ -> Error $"Neplatný čas: {value}"

let notTooFarInFuture (label: string) (moment: DateTimeOffset) =
    if moment > DateTimeOffset.UtcNow.AddMinutes FutureToleranceMinutes then
        Error $"{label} nesmí ležet v budoucnosti"
    else
        Ok()

/// Porovnání dvou kanonických časů jako textu.
///
/// Ordinálně schválně: obě strany mají pevnou šířku, takže pořadí textu
/// odpovídá pořadí v čase — a kulturní porovnání by tu bylo jen dražší
/// způsob, jak dojít ke stejnému výsledku.
let compareTimes (left: string) (right: string) = String.CompareOrdinal(left, right)

// ── Tagy ────────────────────────────────────────────────────────────────────

/// Sloučí duplicity bez ohledu na velikost písmen; zůstává **první** zadaná
/// varianta. Kdyby se tagy převáděly na malá písmena, uživatel by v seznamu
/// nenašel to, co napsal.
let dedupeIgnoringCase (values: string seq) : string list =
    let seen (acc: string list) (value: string) =
        acc
        |> List.exists (fun known -> String.Equals(known, value, StringComparison.OrdinalIgnoreCase))

    values
    |> Seq.fold (fun acc value -> if seen acc value then acc else acc @ [ value ]) []

/// Ořeže, zahodí prázdné a sloučí duplicity (FR-WL-05).
let normalizeTags (tags: string list) : Result<string list, string> =
    let cleaned =
        tags
        |> List.map (fun (tag: string) -> tag.Trim())
        |> List.filter (fun tag -> tag <> "")
        |> dedupeIgnoringCase

    if cleaned |> List.exists (fun tag -> tag.Length > MaxTagLength) then
        Error $"Tag může mít nejvýš {MaxTagLength} znaků"
    elif cleaned.Length > MaxTags then
        Error $"Záznam může mít nejvýš {MaxTags} tagů"
    else
        Ok cleaned

let serializeTags (tags: string list) =
    Text.Json.JsonSerializer.Serialize(tags |> List.toArray)

let deserializeTags (json: string) =
    try
        Text.Json.JsonSerializer.Deserialize<string[]>(json)
        |> Option.ofObj
        |> Option.map Array.toList
        |> Option.defaultValue []
    with _ ->
        []

// ── Validace ────────────────────────────────────────────────────────────────

let private validateEnd (startMoment: DateTimeOffset) (endValue: string) =
    match canonicalTime endValue with
    | Error message -> Error message
    | Ok(endMoment, endText) ->
        if endMoment < startMoment then
            Error "Konec nesmí být dřív než začátek"
        elif (endMoment - startMoment).TotalHours > MaxDurationHours then
            Error $"Záznam může trvat nejvýš {int MaxDurationHours} hodin"
        else
            notTooFarInFuture "Konec" endMoment |> Result.map (fun () -> Some endText)

/// Dvojice začátek/konec v kanonickém tvaru, nebo česká chyba.
let validateTimes (started: string) (ended: string option) : Result<string * string option, string> =
    match canonicalTime started with
    | Error message -> Error message
    | Ok(startMoment, startText) ->
        match notTooFarInFuture "Začátek" startMoment with
        | Error message -> Error message
        | Ok() ->
            match ended with
            | None -> Ok(startText, None)
            | Some value -> validateEnd startMoment value |> Result.map (fun endText -> startText, endText)

let private validateText (title: string) (description: string) =
    if title = "" then
        Error "Název činnosti je povinný"
    elif title.Length > MaxTitleLength then
        Error $"Název může mít nejvýš {MaxTitleLength} znaků"
    elif description.Length > MaxDescriptionLength then
        Error $"Popis může mít nejvýš {MaxDescriptionLength} znaků"
    else
        Ok()

let validate (fields: WorkLogFields) : Result<Validated, string> =
    let title = fields.Title.Trim()

    match validateText title fields.Description with
    | Error message -> Error message
    | Ok() ->
        match normalizeTags fields.Tags, validateTimes fields.StartedAt fields.EndedAt with
        | Error message, _ -> Error message
        | _, Error message -> Error message
        | Ok tags, Ok(startedAt, endedAt) ->
            Ok
                {
                    Title = title
                    Description = fields.Description
                    StartedAt = startedAt
                    EndedAt = endedAt
                    TagsJson = serializeTags tags
                }
