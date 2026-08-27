/// Repozitář ADO přihlašovacích údajů (ADR-008, PRD-06).
///
/// PAT sem přichází už zašifrovaný (Data Protection API) a v čitelné podobě
/// nikdy neopouští server. Snapshot je podle PRD-00 sdílený per projekt,
/// i když řádek má klíč (project_id, user_id) — zapisuje se proto všem
/// řádkům projektu.
module MSProjectManager.Persistence.Repositories.AdoCredentials

open System.Linq
open Microsoft.EntityFrameworkCore
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repository

/// Šifrovaný PAT konkrétního uživatele v konkrétním projektu.
type EncryptedPat =
    {
        ProjectId: string
        UserId: string
        PatEncrypted: string
    }

/// Co o PATu smí vědět klient (FR-ADO-02) — token samotný nikdy.
type PatStatus =
    {
        PatSet: bool
        UpdatedAt: string option
    }

let private tryFindRow (db: AppDbContext) (projectId: string) (userId: string) =
    async {
        let! row =
            db.AdoCredentials
                .AsNoTracking()
                .FirstOrDefaultAsync(fun row -> row.ProjectId = projectId && row.UserId = userId)
            |> Async.AwaitTask

        return Option.ofObj row
    }

/// Uloží nebo přepíše šifrovaný PAT.
let savePat (db: AppDbContext) (credential: EncryptedPat) : Async<string> =
    async {
        let timestamp = nowIso ()
        let! existing = tryFindRow db credential.ProjectId credential.UserId

        match existing with
        | Some row ->
            db.AdoCredentials.Update
                { row with
                    PatEncrypted = credential.PatEncrypted
                    UpdatedAt = timestamp
                }
            |> ignore
        | None ->
            db.AdoCredentials.Add
                {
                    ProjectId = credential.ProjectId
                    UserId = credential.UserId
                    PatEncrypted = credential.PatEncrypted
                    SnapshotJson = null
                    UpdatedAt = timestamp
                }
            |> ignore

        do! saveChanges db
        return timestamp
    }

/// Šifrovaný PAT k dešifrování na serveru.
let tryGetPat (db: AppDbContext) (projectId: string) (userId: string) : Async<string option> =
    async {
        let! row = tryFindRow db projectId userId
        return row |> Option.map (fun value -> value.PatEncrypted)
    }

/// Stav PATu pro UI.
let patStatus (db: AppDbContext) (projectId: string) (userId: string) : Async<PatStatus> =
    async {
        let! row = tryFindRow db projectId userId

        return
            match row with
            | Some value ->
                {
                    PatSet = true
                    UpdatedAt = Some value.UpdatedAt
                }
            | None -> { PatSet = false; UpdatedAt = None }
    }

/// Smaže PAT (tlačítko „Smazat PAT" v ADO Sync view).
let deletePat (db: AppDbContext) (projectId: string) (userId: string) : Async<bool> =
    async {
        let! row = tryFindRow db projectId userId

        match row with
        | None -> return false
        | Some existing ->
            db.AdoCredentials.Remove existing |> ignore
            do! saveChanges db
            return true
    }

/// Uloží snapshot posledního syncu všem řádkům projektu.
let saveSnapshot (db: AppDbContext) (projectId: string) (snapshotJson: string) : Async<unit> =
    async {
        let! rows =
            db.AdoCredentials.AsNoTracking().Where(fun row -> row.ProjectId = projectId).ToListAsync()
            |> Async.AwaitTask

        for row in rows do
            db.AdoCredentials.Update { row with SnapshotJson = snapshotJson } |> ignore

        do! saveChanges db
    }

/// Snapshot posledního syncu projektu.
let tryGetSnapshot (db: AppDbContext) (projectId: string) : Async<string option> =
    async {
        let! rows =
            db.AdoCredentials.AsNoTracking().Where(fun row -> row.ProjectId = projectId).ToListAsync()
            |> Async.AwaitTask

        return rows |> Seq.tryPick (fun row -> ofNullable row.SnapshotJson)
    }
