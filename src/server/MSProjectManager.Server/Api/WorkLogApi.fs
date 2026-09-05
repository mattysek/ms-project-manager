/// Vykazování práce — per-user REST (PRD-10, ADR-017).
///
/// Mimo SignalR ze stejného důvodu jako quick notes a trezor: `AppState` se
/// broadcastuje všem členům projektu (ADR-004) a výkaz je soukromý. Vlastníka
/// bere každý handler **z přihlášení**, nikdy z těla požadavku — jiná cesta
/// k datům než „moje" tu neexistuje, ani pro administrátora (FR-WL-12).
module MSProjectManager.Api.WorkLogApi

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repositories
open MSProjectManager.Api.Contracts
open MSProjectManager.Api.Http

let private db (ctx: HttpContext) = service<AppDbContext> ctx

/// Nepovinný parametr dotazu; prázdný řetězec je totéž co chybějící.
let private query (ctx: HttpContext) (name: string) =
    match ctx.Request.Query.TryGetValue name with
    | true, values ->
        let value = values.ToString()

        if String.IsNullOrWhiteSpace value then None else Some value
    | _ -> None

let private toResponse (entry: WorkLog.WorkLogEntry) : WorkLogEntryResponse =
    {
        Id = entry.Id
        Title = entry.Title
        Description = entry.Description
        ProjectId = entry.ProjectId
        StartedAt = entry.StartedAt
        EndedAt = entry.EndedAt
        Tags = entry.Tags
        CreatedAt = entry.CreatedAt
        UpdatedAt = entry.UpdatedAt
    }

let private entryId (request: WorkLogEntryRequest) =
    match Option.ofObj request.Id with
    | Some value when not (String.IsNullOrWhiteSpace value) -> value
    | _ -> Guid.NewGuid().ToString "N"

let private toInput (ctx: HttpContext) (id: string) (request: WorkLogEntryRequest) : WorkLog.WorkLogInput =
    {
        Id = id
        UserId = userId ctx
        Title = request.Title
        Description = request.Description |> Option.ofObj |> Option.defaultValue ""
        ProjectId = Option.ofObj request.ProjectId
        StartedAt = request.StartedAt
        EndedAt = Option.ofObj request.EndedAt
        Tags =
            request.Tags
            |> Option.ofObj
            |> Option.map Array.toList
            |> Option.defaultValue []
    }

/// `GET /api/worklog?from=&to=` — záznamy v rozsahu, od nejnovějších.
let list (ctx: HttpContext) : Task<IResult> =
    task {
        let! result = WorkLog.listForUser (db ctx) (userId ctx) (query ctx "from") (query ctx "to")

        match result with
        | Ok entries -> return entries |> List.map toResponse |> Results.Json
        | Error message -> return badRequest message
    }

/// `GET /api/worklog/running` — právě běžící činnost, pokud nějaká je.
let running (ctx: HttpContext) : Task<IResult> =
    task {
        let! entry = WorkLog.tryGetRunning (db ctx) (userId ctx)

        return
            Results.Json(
                {
                    Running = entry |> Option.map toResponse
                }
                : RunningWorkResponse
            )
    }

/// `GET /api/worklog/tags` — tagy z posledních záznamů pro našeptávač.
let tags (ctx: HttpContext) : Task<IResult> =
    task {
        let! found = WorkLog.listRecentTags (db ctx) (userId ctx)
        return Results.Json found
    }

/// `POST /api/worklog` — nový záznam.
///
/// Jeden endpoint pro ruční zápis i pro spuštění stopek: rozdíl je jen v tom,
/// jestli přijde `endedAt`. Chybí-li, repozitář zároveň ukončí předchozí
/// běžící činnost (FR-WL-03) a vrátí ji v `stoppedPrevious`.
let create (ctx: HttpContext) : Task<IResult> =
    task {
        match! readJson<WorkLogEntryRequest> ctx with
        | None -> return badRequest "Chybí obsah záznamu"
        | Some request ->
            let! created = WorkLog.create (db ctx) (toInput ctx (entryId request) request)

            match created with
            | Ok result ->
                return
                    Results.Json(
                        {
                            Entry = toResponse result.Entry
                            StoppedPrevious = result.StoppedPrevious |> Option.map toResponse
                        }
                        : WorkLogWriteResponse
                    )
            | Error message -> return badRequest message
    }

/// `PUT /api/worklog/{id}` — úprava včetně ručně opravených časů (FR-WL-04).
let update (ctx: HttpContext) (id: string) : Task<IResult> =
    task {
        match! readJson<WorkLogEntryRequest> ctx with
        | None -> return badRequest "Chybí obsah záznamu"
        | Some request ->
            let! updated = WorkLog.update (db ctx) (toInput ctx id request)

            match updated with
            // Cizí i neexistující záznam je 404; existence cizích dat se
            // nepotvrzuje (FR-WL-12).
            | Ok entry -> return Results.Json(toResponse entry)
            | Error "Záznam neexistuje" -> return notFound "Záznam neexistuje"
            | Error message -> return badRequest message
    }

/// `POST /api/worklog/stop` — zastavení běžících stopek.
let stop (ctx: HttpContext) : Task<IResult> =
    task {
        match! readJson<StopWorkRequest> ctx with
        | None -> return badRequest "Chybí čas ukončení"
        | Some request ->
            let! stopped = WorkLog.stop (db ctx) (userId ctx) request.EndedAt

            match stopped with
            | Ok entry -> return Results.Json(toResponse entry)
            | Error message -> return badRequest message
    }

/// `DELETE /api/worklog/{id}` — cizí záznam se tváří jako neexistující.
let delete (ctx: HttpContext) (id: string) : Task<IResult> =
    task {
        let! deleted = WorkLog.delete (db ctx) id (userId ctx)

        if deleted then
            return Results.NoContent()
        else
            return notFound "Záznam neexistuje"
    }
