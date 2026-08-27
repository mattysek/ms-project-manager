/// Repozitář příloh — BLOB v SQLite (ADR-010).
///
/// Stav projektu nese jen `FileRef` (metadata); obsah se čte samostatně přes
/// `GET /api/files/{id}`, aby se BLOBy nikdy nedostaly do `state_json` ani
/// do SignalR broadcastu.
module MSProjectManager.Persistence.Repositories.Files

open System.Linq
open Microsoft.EntityFrameworkCore
open MSProjectManager.Domain.Types
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repository

/// Příloha i s obsahem — pro upload a download.
type StoredFile = { Ref: FileRef; Data: byte[] }

/// Nahrávaná příloha.
type NewFile =
    {
        ProjectId: string
        Ref: FileRef
        Data: byte[]
    }

let private toRef (row: FileRow) : FileRef =
    {
        Id = row.Id
        Name = row.Name
        MimeType = row.MimeType
        Size = row.Size
        AddedAt = row.AddedAt
        AddedBy = row.AddedBy
        Note = row.Note
    }

let private tryFindRow (db: AppDbContext) (fileId: string) =
    async {
        let! row =
            db.Files.AsNoTracking().FirstOrDefaultAsync(fun row -> row.Id = fileId)
            |> Async.AwaitTask

        return Option.ofObj row
    }

/// Metadata příloh projektu — načítá se při startu actoru do `AppState`.
let listForProject (db: AppDbContext) (projectId: string) : Async<FileRef list> =
    async {
        let! rows =
            db.Files
                .AsNoTracking()
                .Where(fun row -> row.ProjectId = projectId)
                .OrderBy(fun row -> row.AddedAt)
                .Select(fun row ->
                    {
                        Id = row.Id
                        ProjectId = row.ProjectId
                        Name = row.Name
                        MimeType = row.MimeType
                        Size = row.Size
                        Data = Array.empty
                        Note = row.Note
                        AddedAt = row.AddedAt
                        AddedBy = row.AddedBy
                    }
                )
                .ToListAsync()
            |> Async.AwaitTask

        return rows |> Seq.map toRef |> Seq.toList
    }

/// Příloha i s obsahem — pro download a preview.
let tryGet (db: AppDbContext) (fileId: string) : Async<StoredFile option> =
    async {
        let! row = tryFindRow db fileId
        return row |> Option.map (fun value -> { Ref = toRef value; Data = value.Data })
    }

/// Ke kterému projektu příloha patří — REST endpoint podle toho ověří členství.
let tryGetProjectId (db: AppDbContext) (fileId: string) : Async<string option> =
    async {
        let! row = tryFindRow db fileId
        return row |> Option.map (fun value -> value.ProjectId)
    }

/// Uloží nahranou přílohu.
let add (db: AppDbContext) (file: NewFile) : Async<unit> =
    async {
        db.Files.Add
            {
                Id = file.Ref.Id
                ProjectId = file.ProjectId
                Name = file.Ref.Name
                MimeType = file.Ref.MimeType
                Size = file.Ref.Size
                Data = file.Data
                Note = file.Ref.Note
                AddedAt = file.Ref.AddedAt
                AddedBy = file.Ref.AddedBy
            }
        |> ignore

        do! saveChanges db
    }

/// Poznámka k příloze je jediné metadatum, které jde měnit po uploadu.
let updateNote (db: AppDbContext) (fileId: string) (note: string) : Async<bool> =
    async {
        let! row = tryFindRow db fileId

        match row with
        | None -> return false
        | Some existing ->
            db.Files.Update { existing with Note = note } |> ignore
            do! saveChanges db
            return true
    }

let delete (db: AppDbContext) (fileId: string) : Async<bool> =
    async {
        let! row = tryFindRow db fileId

        match row with
        | None -> return false
        | Some existing ->
            db.Files.Remove existing |> ignore
            do! saveChanges db
            return true
    }

/// Součet velikostí příloh projektu — proti limitu 500 MB per projekt (PRD-00).
let totalSize (db: AppDbContext) (projectId: string) : Async<int64> =
    async {
        let! sizes =
            db.Files
                .AsNoTracking()
                .Where(fun row -> row.ProjectId = projectId)
                .Select(fun row -> row.Size)
                .ToListAsync()
            |> Async.AwaitTask

        return Seq.sum sizes
    }
