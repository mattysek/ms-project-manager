/// Repozitář osobních poznámek (PRD-04).
///
/// Quick notes jsou per-user a nebroadcastují se přes SignalR — chodí přes
/// REST. Každá operace proto ověřuje vlastníka: cizí poznámku nesmí uživatel
/// ani přečíst.
module MSProjectManager.Persistence.Repositories.QuickNotes

open System.Linq
open Microsoft.EntityFrameworkCore
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repository

/// Maximální délka obsahu poznámky (PRD-04, NFR).
[<Literal>]
let MaxContentLength = 10000

/// Maximální počet poznámek na uživatele (PRD-04, NFR).
[<Literal>]
let MaxNotesPerUser = 500

/// Poznámka tak, jak ji vidí klient.
type QuickNote =
    {
        Id: string
        Content: string
        LinkedProjectId: string option
        ConvertedToTaskId: string option
        CreatedAt: string
        UpdatedAt: string
    }

/// Zakládaná poznámka.
type NewQuickNote =
    {
        Id: string
        UserId: string
        Content: string
        LinkedProjectId: string option
    }

/// Změna poznámky. `None` u odkazů znamená „bez vazby".
type QuickNoteUpdate =
    {
        Id: string
        UserId: string
        Content: string
        LinkedProjectId: string option
        ConvertedToTaskId: string option
    }

let private toNote (row: QuickNoteRow) : QuickNote =
    {
        Id = row.Id
        Content = row.Content
        LinkedProjectId = ofNullable row.LinkedProjectId
        ConvertedToTaskId = ofNullable row.ConvertedToTaskId
        CreatedAt = row.CreatedAt
        UpdatedAt = row.UpdatedAt
    }

let private tryFindOwnRow (db: AppDbContext) (noteId: string) (userId: string) =
    async {
        let! row =
            db.QuickNotes.AsNoTracking().FirstOrDefaultAsync(fun row -> row.Id = noteId && row.UserId = userId)
            |> Async.AwaitTask

        return Option.ofObj row
    }

let private validateContent (content: string) =
    if System.String.IsNullOrWhiteSpace content then
        Error "Poznámka musí mít obsah"
    elif content.Length > MaxContentLength then
        Error $"Poznámka může mít nejvýš {MaxContentLength} znaků"
    else
        Ok()

/// Poznámky uživatele, od naposledy upravených (FR-QN-02).
let listForUser (db: AppDbContext) (userId: string) : Async<QuickNote list> =
    async {
        let! rows =
            db.QuickNotes
                .AsNoTracking()
                .Where(fun row -> row.UserId = userId)
                .OrderByDescending(fun row -> row.UpdatedAt)
                .ToListAsync()
            |> Async.AwaitTask

        return rows |> Seq.map toNote |> Seq.toList
    }

/// Vlastní poznámka; cizí se tváří jako neexistující.
let tryGet (db: AppDbContext) (noteId: string) (userId: string) : Async<QuickNote option> =
    async {
        let! row = tryFindOwnRow db noteId userId
        return row |> Option.map toNote
    }

/// Založí poznámku.
let create (db: AppDbContext) (note: NewQuickNote) : Async<Result<QuickNote, string>> =
    async {
        let! count = db.QuickNotes.CountAsync(fun row -> row.UserId = note.UserId) |> Async.AwaitTask

        match validateContent note.Content with
        | Error message -> return Error message
        | Ok() when count >= MaxNotesPerUser -> return Error $"Překročen limit {MaxNotesPerUser} poznámek"
        | Ok() ->
            let timestamp = nowIso ()

            let row =
                {
                    Id = note.Id
                    UserId = note.UserId
                    Content = note.Content
                    LinkedProjectId = toNullable note.LinkedProjectId
                    ConvertedToTaskId = null
                    CreatedAt = timestamp
                    UpdatedAt = timestamp
                }

            db.QuickNotes.Add row |> ignore
            do! saveChanges db
            return Ok(toNote row)
    }

/// Přepíše obsah a vazby poznámky.
let update (db: AppDbContext) (note: QuickNoteUpdate) : Async<Result<QuickNote, string>> =
    async {
        let! existing = tryFindOwnRow db note.Id note.UserId

        match existing, validateContent note.Content with
        | None, _ -> return Error "Poznámka neexistuje"
        | Some _, Error message -> return Error message
        | Some row, Ok() ->
            let updated =
                { row with
                    Content = note.Content
                    LinkedProjectId = toNullable note.LinkedProjectId
                    ConvertedToTaskId = toNullable note.ConvertedToTaskId
                    UpdatedAt = nowIso ()
                }

            db.QuickNotes.Update updated |> ignore
            do! saveChanges db
            return Ok(toNote updated)
    }

/// Smaže vlastní poznámku (FR-QN-05 — bez koše).
let delete (db: AppDbContext) (noteId: string) (userId: string) : Async<bool> =
    async {
        let! existing = tryFindOwnRow db noteId userId

        match existing with
        | None -> return false
        | Some row ->
            db.QuickNotes.Remove row |> ignore
            do! saveChanges db
            return true
    }
