/// Quick notes — per-user REST (PRD-04, FR-QN-08).
///
/// Záměrně mimo SignalR: poznámky jsou soukromé, broadcast by neměl co dělat.
module MSProjectManager.Api.QuickNotesApi

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repositories
open MSProjectManager.Api.Contracts
open MSProjectManager.Api.Http

let private db (ctx: HttpContext) = service<AppDbContext> ctx

let private toResponse (note: QuickNotes.QuickNote) =
    {
        Id = note.Id
        Content = note.Content
        LinkedProjectId = Option.toObj note.LinkedProjectId
        ConvertedToTaskId = Option.toObj note.ConvertedToTaskId
        CreatedAt = note.CreatedAt
        UpdatedAt = note.UpdatedAt
    }

/// `GET /api/quick-notes`
let list (ctx: HttpContext) : Task<IResult> =
    task {
        let! notes = QuickNotes.listForUser (db ctx) (userId ctx)
        return notes |> List.map toResponse |> Results.Json
    }

/// `POST /api/quick-notes`
let create (ctx: HttpContext) : Task<IResult> =
    task {
        match! readJson<CreateNoteRequest> ctx with
        | None -> return badRequest "Chybí obsah poznámky"
        | Some request ->
            let noteId =
                match Option.ofObj request.Id with
                | Some value when not (String.IsNullOrWhiteSpace value) -> value
                | _ -> Guid.NewGuid().ToString "N"

            // Přehrání offline fronty smí doručit stejný `create` dvakrát
            // (např. když odpověď nedorazila, ale zápis proběhl). Existující
            // poznámku proto vrátíme, místo abychom hlásili chybu.
            match! QuickNotes.tryGet (db ctx) noteId (userId ctx) with
            | Some existing -> return Results.Json(toResponse existing)
            | None ->

            let! created =
                QuickNotes.create
                    (db ctx)
                    {
                        Id = noteId
                        UserId = userId ctx
                        Content = request.Content
                        LinkedProjectId = Option.ofObj request.LinkedProjectId
                    }

            match created with
            | Ok note -> return Results.Json(toResponse note)
            | Error message -> return badRequest message
    }

/// `PATCH /api/quick-notes/{id}`
let update (ctx: HttpContext) (noteId: string) : Task<IResult> =
    task {
        match! readJson<UpdateNoteRequest> ctx with
        | None -> return badRequest "Chybí obsah poznámky"
        | Some request ->
            let! updated =
                QuickNotes.update
                    (db ctx)
                    {
                        Id = noteId
                        UserId = userId ctx
                        Content = request.Content
                        LinkedProjectId = Option.ofObj request.LinkedProjectId
                        ConvertedToTaskId = Option.ofObj request.ConvertedToTaskId
                    }

            match updated with
            | Ok note -> return Results.Json(toResponse note)
            | Error message -> return badRequest message
    }

/// `DELETE /api/quick-notes/{id}` — cizí poznámka se tváří jako neexistující.
let delete (ctx: HttpContext) (noteId: string) : Task<IResult> =
    task {
        let! deleted = QuickNotes.delete (db ctx) noteId (userId ctx)

        if deleted then
            return Results.NoContent()
        else
            return notFound "Poznámka neexistuje"
    }
