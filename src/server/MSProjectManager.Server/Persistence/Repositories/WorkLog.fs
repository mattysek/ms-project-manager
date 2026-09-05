/// Repozitář vykazování práce (PRD-10, ADR-017).
///
/// Pravidla o tom, co je platný záznam, žijí v `Domain.WorkLogRules` — tady
/// zůstalo jen čtení a zápis. Dvě věci, které ten zápis odlišují od ostatních
/// repozitářů:
///
/// - **Časy přicházejí od klienta**, server je nevyrábí. Uživatel je musí umět
///   ručně opravit (FR-WL-04), takže server na ně stejně není autorita.
/// - **Nejvýš jeden běžící záznam na uživatele.** Drží to `closeRunning`, ne
///   klient — v horní liště je jedno tlačítko „Stop" a dvě běžící činnosti by
///   mu vzaly smysl (FR-WL-03).
///
/// Vlastnictví se ověřuje u každé operace a cizí záznam se tváří jako
/// neexistující (FR-WL-12), stejné pravidlo jako u quick notes a trezoru.
module MSProjectManager.Persistence.Repositories.WorkLog

open System
open System.Linq
open Microsoft.EntityFrameworkCore
open MSProjectManager.Domain.WorkLogRules
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repository

/// Kolik posledních záznamů se prohledá kvůli našeptávači tagů (FR-WL-05).
[<Literal>]
let TagSuggestionScanSize = 500

/// Záznam tak, jak putuje na klienta.
type WorkLogEntry =
    {
        Id: string
        Title: string
        Description: string
        ProjectId: string option
        StartedAt: string
        /// `None` = běžící činnost.
        EndedAt: string option
        Tags: string list
        CreatedAt: string
        UpdatedAt: string
    }

/// Zakládaný nebo přepisovaný záznam. `Id` volí klient (jako u quick notes).
type WorkLogInput =
    {
        Id: string
        UserId: string
        Title: string
        Description: string
        ProjectId: string option
        StartedAt: string
        EndedAt: string option
        Tags: string list
    }

/// Výsledek zápisu: uložený záznam a činnost, kterou jeho start případně
/// ukončil (FR-WL-03 — uživatel se to musí dozvědět).
type WriteResult =
    {
        Entry: WorkLogEntry
        StoppedPrevious: WorkLogEntry option
    }

let private toEntry (row: WorkLogEntryRow) : WorkLogEntry =
    {
        Id = row.Id
        Title = row.Title
        Description = row.Description
        ProjectId = ofNullable row.ProjectId
        StartedAt = row.StartedAt
        EndedAt = ofNullable row.EndedAt
        Tags = deserializeTags row.Tags
        CreatedAt = row.CreatedAt
        UpdatedAt = row.UpdatedAt
    }

let private fieldsOf (input: WorkLogInput) : WorkLogFields =
    {
        Title = input.Title
        Description = input.Description
        Tags = input.Tags
        StartedAt = input.StartedAt
        EndedAt = input.EndedAt
    }

// ── Dotazy ──────────────────────────────────────────────────────────────────

/// Běžící záznam se pozná podle prázdného `ended_at`.
///
/// `String.IsNullOrEmpty` je tu schválně místo `= null`: EF ho překládá na
/// `IS NULL OR = ''`, kdežto rovnost s `null` se v SQL vyhodnotí jako `NULL`,
/// tedy nikdy nepravda — a dotaz by tiše vracel prázdno.
let private runningQuery (db: AppDbContext) (userId: string) =
    db.WorkLogEntries.Where(fun row -> row.UserId = userId && String.IsNullOrEmpty row.EndedAt)

let private tryFindOwn (db: AppDbContext) (entryId: string) (userId: string) =
    async {
        let! row =
            db.WorkLogEntries.AsNoTracking().FirstOrDefaultAsync(fun row -> row.Id = entryId && row.UserId = userId)
            |> Async.AwaitTask

        return Option.ofObj row
    }

let private applyRange (query: IQueryable<WorkLogEntryRow>) (fromIso: string option) (toIso: string option) =
    match fromIso, toIso with
    | Some fromValue, Some toValue ->
        query.Where(fun row ->
            String.Compare(row.StartedAt, fromValue) >= 0
            && String.Compare(row.StartedAt, toValue) < 0
        )
    | Some fromValue, None -> query.Where(fun row -> String.Compare(row.StartedAt, fromValue) >= 0)
    | None, Some toValue -> query.Where(fun row -> String.Compare(row.StartedAt, toValue) < 0)
    | None, None -> query

/// Záznamy uživatele v polootevřeném rozsahu `[from, to)`, od nejnovějších.
///
/// Meze se **musí** převést na kanonický tvar, než se s nimi půjde do dotazu.
/// Rozsah se porovnává jako text a klient posílá `2026-09-01T00:00:00.000Z`,
/// zatímco ve sloupci leží `2026-09-01T00:00:00.0000000+00:00` — na znaku `Z`
/// proti `0` by se stejný okamžik seřadil jinam a hranice by tiše ujela.
/// `String.Compare` je použité proto, že F# operátor `>=` nad řetězci EF
/// nepřeloží.
let listForUser
    (db: AppDbContext)
    (userId: string)
    (fromIso: string option)
    (toIso: string option)
    : Async<Result<WorkLogEntry list, string>> =
    async {
        let bound value =
            match value with
            | None -> Ok None
            | Some raw -> canonicalTime raw |> Result.map (fun (_, text) -> Some text)

        match bound fromIso, bound toIso with
        | Error message, _ -> return Error message
        | _, Error message -> return Error message
        | Ok fromCanonical, Ok toCanonical ->
            let query =
                applyRange
                    (db.WorkLogEntries.AsNoTracking().Where(fun row -> row.UserId = userId))
                    fromCanonical
                    toCanonical

            let! rows =
                query.OrderByDescending(fun row -> row.StartedAt).ToListAsync()
                |> Async.AwaitTask

            return Ok(rows |> Seq.map toEntry |> Seq.toList)
    }

/// Právě běžící činnost uživatele, pokud nějaká je.
let tryGetRunning (db: AppDbContext) (userId: string) : Async<WorkLogEntry option> =
    async {
        let! row =
            (runningQuery db userId).AsNoTracking().OrderByDescending(fun row -> row.StartedAt).FirstOrDefaultAsync()
            |> Async.AwaitTask

        return row |> Option.ofObj |> Option.map toEntry
    }

/// Vlastní záznam; cizí se tváří jako neexistující.
let tryGet (db: AppDbContext) (entryId: string) (userId: string) : Async<WorkLogEntry option> =
    async {
        let! row = tryFindOwn db entryId userId
        return row |> Option.map toEntry
    }

/// Tagy z posledních záznamů — podklad pro našeptávač (FR-WL-05).
///
/// Prohledává se jen omezené okno, ne celá historie: našeptávač má nabídnout,
/// co uživatel používá teď, a projít kvůli tomu dvacet tisíc řádků by bylo
/// nepoměrné.
let listRecentTags (db: AppDbContext) (userId: string) : Async<string list> =
    async {
        let! rows =
            db.WorkLogEntries
                .AsNoTracking()
                .Where(fun row -> row.UserId = userId)
                .OrderByDescending(fun row -> row.StartedAt)
                .Take(TagSuggestionScanSize)
                .Select(fun row -> row.Tags)
                .ToListAsync()
            |> Async.AwaitTask

        return
            rows
            |> Seq.collect deserializeTags
            |> dedupeIgnoringCase
            |> List.sortWith (fun a b -> String.Compare(a, b, StringComparison.InvariantCultureIgnoreCase))
    }

// ── Zápisy ──────────────────────────────────────────────────────────────────

/// Uzavře běžící záznamy uživatele k danému okamžiku a vrátí ty uzavřené.
///
/// Konec se nastavuje na okamžik, kdy začíná nová činnost — ne na „teď".
/// Díky tomu mezi navazujícími záznamy nevznikne ani díra, ani překryv
/// (FR-WL-03). Množné číslo je pojistka: kdyby se do dat přesto dostaly dva
/// běžící řádky, uzavřou se oba, ať se invarianta samovolně opraví.
///
/// `AsNoTracking` je tu nutnost, ne optimalizace: `{ row with … }` je nová
/// instance se stejným klíčem a sledovaný originál by s ní v `Update`
/// kolidoval („another instance with the same key value"). Stejná past jako
/// ve `Vault.rekey`.
let private closeRunning (db: AppDbContext) (userId: string) (endedAt: string) (exceptId: string option) =
    async {
        let! rows = (runningQuery db userId).AsNoTracking().ToListAsync() |> Async.AwaitTask

        return
            rows
            |> Seq.filter (fun row -> exceptId <> Some row.Id)
            |> Seq.map (fun row ->
                let updated =
                    { row with
                        // Stopky spuštěné *po* okamžiku uzavření by jinak
                        // dostaly konec před svým začátkem.
                        EndedAt =
                            (if compareTimes row.StartedAt endedAt > 0 then
                                 row.StartedAt
                             else
                                 endedAt)
                        UpdatedAt = nowIso ()
                    }

                db.WorkLogEntries.Update updated |> ignore
                toEntry updated
            )
            |> Seq.toList
    }

/// Založí záznam. Bez konce je to spuštění stopek, takže se předchozí běžící
/// činnost uzavře ve stejném okamžiku.
let create (db: AppDbContext) (input: WorkLogInput) : Async<Result<WriteResult, string>> =
    async {
        let! count =
            db.WorkLogEntries.CountAsync(fun row -> row.UserId = input.UserId)
            |> Async.AwaitTask

        match validate (fieldsOf input) with
        | Error message -> return Error message
        | Ok _ when count >= MaxEntriesPerUser -> return Error $"Překročen limit {MaxEntriesPerUser} záznamů"
        | Ok valid ->
            let timestamp = nowIso ()

            let! stopped =
                match valid.EndedAt with
                | None -> closeRunning db input.UserId valid.StartedAt (Some input.Id)
                | Some _ -> async { return [] }

            let row =
                {
                    Id = input.Id
                    UserId = input.UserId
                    Title = valid.Title
                    Description = valid.Description
                    ProjectId = toNullable input.ProjectId
                    StartedAt = valid.StartedAt
                    EndedAt = toNullable valid.EndedAt
                    Tags = valid.TagsJson
                    CreatedAt = timestamp
                    UpdatedAt = timestamp
                }

            db.WorkLogEntries.Add row |> ignore
            do! saveChanges db

            return
                Ok
                    {
                        Entry = toEntry row
                        StoppedPrevious = List.tryHead stopped
                    }
    }

/// Rozběhnout hotový záznam jde jen tehdy, když zrovna nic jiného neběží.
///
/// Automaticky uzavírat cizí činnost se tu — na rozdíl od `create` — nesmí:
/// uživatel opravuje starý řádek a rozhodně nečeká, že mu to zastaví stopky,
/// které si právě pustil.
let private wouldCollide (running: WorkLogEntry option) (entryId: string) (endedAt: string option) =
    endedAt.IsNone
    && (
        match running with
        | Some other -> other.Id <> entryId
        | None -> false
    )

/// Přepíše obsah i časy existujícího záznamu (FR-WL-04).
let update (db: AppDbContext) (input: WorkLogInput) : Async<Result<WorkLogEntry, string>> =
    async {
        let! existing = tryFindOwn db input.Id input.UserId

        match existing, validate (fieldsOf input) with
        | None, _ -> return Error "Záznam neexistuje"
        | Some _, Error message -> return Error message
        | Some row, Ok valid ->
            let! running = tryGetRunning db input.UserId

            if wouldCollide running row.Id valid.EndedAt then
                return Error "Jiná činnost už běží; nejdřív ji ukonči"
            else
                let updated =
                    { row with
                        Title = valid.Title
                        Description = valid.Description
                        ProjectId = toNullable input.ProjectId
                        StartedAt = valid.StartedAt
                        EndedAt = toNullable valid.EndedAt
                        Tags = valid.TagsJson
                        UpdatedAt = nowIso ()
                    }

                db.WorkLogEntries.Update updated |> ignore
                do! saveChanges db
                return Ok(toEntry updated)
    }

/// Zastaví běžící činnost k zadanému okamžiku (FR-WL-02).
///
/// Okamžik posílá klient — je to čas kliknutí, ne čas doručení požadavku,
/// takže opakovaný pokus po výpadku zapíše pořád ten správný (ADR-017).
let private closeTo (db: AppDbContext) (userId: string) (entry: WorkLogEntry) (endText: string) =
    async {
        match validateTimes entry.StartedAt (Some endText) with
        | Error message -> return Error message
        | Ok _ ->
            let! closed = closeRunning db userId endText None
            do! saveChanges db

            return
                closed
                |> List.tryFind (fun row -> row.Id = entry.Id)
                |> Option.map Ok
                |> Option.defaultValue (Error "Žádná činnost neběží")
    }

let stop (db: AppDbContext) (userId: string) (endedAt: string) : Async<Result<WorkLogEntry, string>> =
    async {
        match canonicalTime endedAt with
        | Error message -> return Error message
        | Ok(endMoment, endText) ->
            match notTooFarInFuture "Konec" endMoment with
            | Error message -> return Error message
            | Ok() ->
                let! running = tryGetRunning db userId

                match running with
                | None -> return Error "Žádná činnost neběží"
                | Some entry -> return! closeTo db userId entry endText
    }

/// Smaže vlastní záznam. Smazání běžícího tím zároveň zastaví stopky (FR-WL-06).
let delete (db: AppDbContext) (entryId: string) (userId: string) : Async<bool> =
    async {
        let! existing =
            db.WorkLogEntries.FirstOrDefaultAsync(fun row -> row.Id = entryId && row.UserId = userId)
            |> Async.AwaitTask

        match Option.ofObj existing with
        | None -> return false
        | Some row ->
            db.WorkLogEntries.Remove row |> ignore
            do! saveChanges db
            return true
    }
