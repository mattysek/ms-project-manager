/// Repozitář projektů. Stav projektu se ukládá jako celý JSON do
/// `projects.state_json` — zapisuje ho debounced `ProjectActor` (ADR-002).
module MSProjectManager.Persistence.Repositories.Projects

open System.Linq
open Microsoft.EntityFrameworkCore
open MSProjectManager.Domain.State
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repository

/// Položka seznamu projektů na LandingPage — včetně role uživatele.
type ProjectSummary =
    {
        Id: string
        Name: string
        Role: ProjectRole
        UpdatedAt: string
        /// `None` = aktivní projekt. Archiv se v UI zobrazuje zvlášť.
        ArchivedAt: string option
    }

/// Nový projekt. Zakladatel se rovnou stává PM (FR-ROLE-02: projekt musí mít
/// vždy alespoň jednoho PM).
type NewProject =
    {
        Id: string
        Name: string
        StateJson: string
        OwnerId: string
    }

/// Uložení stavu — název držíme i ve sloupci, aby šel seznam projektů načíst
/// bez parsování JSONu.
type StateUpdate = { Name: string; StateJson: string }

/// Projekt i s uloženým stavem — podklad pro čtení napříč projekty.
///
/// Actory se schválně obcházejí: probouzet actor každého projektu kvůli
/// jednomu přehledovému dotazu jde proti ADR-002 a u patnáctičlenného týmu by
/// to znamenalo držet v paměti všechno. Daní je zpoždění — actor persistuje po
/// ticku (`PersistInterval`, 5 s), takže tahle projekce může být o tolik
/// pozadu. Pro přehled to stačí, pro rozhodování o zápisu ne.
type ProjectWithState =
    {
        Id: string
        Name: string
        Role: ProjectRole
        Archived: bool
        StateJson: string
    }

/// Projekty uživatele včetně `state_json`; archivované volitelně.
let listWithStateForUser
    (db: AppDbContext)
    (userId: string)
    (includeArchived: bool)
    : Async<ProjectWithState list> =
    async {
        let! memberships =
            db.ProjectMembers.AsNoTracking().Where(fun row -> row.UserId = userId).ToListAsync()
            |> Async.AwaitTask

        let ids = memberships |> Seq.map (fun row -> row.ProjectId) |> Seq.toArray

        let! rows =
            db.Projects.AsNoTracking().Where(fun row -> ids.Contains row.Id).ToListAsync()
            |> Async.AwaitTask

        let roleOf projectId =
            memberships
            |> Seq.tryFind (fun row -> row.ProjectId = projectId)
            |> Option.bind (fun row -> roleOfText row.Role)

        return
            rows
            |> Seq.choose (fun row ->
                let archived = (ofNullable row.ArchivedAt).IsSome

                if archived && not includeArchived then
                    None
                else
                    roleOf row.Id
                    |> Option.map (fun role ->
                        {
                            Id = row.Id
                            Name = row.Name
                            Role = role
                            Archived = archived
                            StateJson = row.StateJson
                        }
                    )
            )
            |> Seq.sortBy (fun project -> project.Name)
            |> Seq.toList
    }

/// Projekty, jichž je uživatel členem, od naposledy upravených.
let listForUser (db: AppDbContext) (userId: string) : Async<ProjectSummary list> =
    async {
        let! memberships =
            db.ProjectMembers.AsNoTracking().Where(fun row -> row.UserId = userId).ToListAsync()
            |> Async.AwaitTask

        let ids = memberships |> Seq.map (fun row -> row.ProjectId) |> Seq.toArray

        let! rows =
            db.Projects.AsNoTracking().Where(fun row -> ids.Contains row.Id).ToListAsync()
            |> Async.AwaitTask

        let roleOf projectId =
            memberships
            |> Seq.tryFind (fun row -> row.ProjectId = projectId)
            |> Option.bind (fun row -> roleOfText row.Role)

        return
            rows
            |> Seq.choose (fun row ->
                roleOf row.Id
                |> Option.map (fun role ->
                    {
                        Id = row.Id
                        Name = row.Name
                        Role = role
                        UpdatedAt = row.UpdatedAt
                        ArchivedAt = ofNullable row.ArchivedAt
                    }
                )
            )
            |> Seq.sortByDescending (fun summary -> summary.UpdatedAt)
            |> Seq.toList
    }

let private tryFindRow (db: AppDbContext) (projectId: string) =
    async {
        let! row =
            db.Projects.AsNoTracking().FirstOrDefaultAsync(fun row -> row.Id = projectId)
            |> Async.AwaitTask

        return Option.ofObj row
    }

/// Serializovaný stav projektu; `None` znamená, že projekt neexistuje.
let tryLoadState (db: AppDbContext) (projectId: string) : Async<string option> =
    async {
        let! row = tryFindRow db projectId
        return row |> Option.map (fun value -> value.StateJson)
    }

/// Založí projekt a zapíše zakladatele jako PM.
let create (db: AppDbContext) (project: NewProject) : Async<unit> =
    async {
        let timestamp = nowIso ()

        db.Projects.Add
            {
                Id = project.Id
                Name = project.Name
                StateJson = project.StateJson
                CreatedAt = timestamp
                UpdatedAt = timestamp
                ArchivedAt = null
            }
        |> ignore

        db.ProjectMembers.Add
            {
                ProjectId = project.Id
                UserId = project.OwnerId
                Role = roleToText Pm
                JoinedAt = timestamp
            }
        |> ignore

        do! saveChanges db
    }

/// Přepíše stav projektu. `false` znamená, že projekt mezitím zmizel.
let saveState (db: AppDbContext) (projectId: string) (update: StateUpdate) : Async<bool> =
    async {
        let! row = tryFindRow db projectId

        match row with
        | None -> return false
        | Some existing ->
            db.Projects.Update
                { existing with
                    Name = update.Name
                    StateJson = update.StateJson
                    UpdatedAt = nowIso ()
                }
            |> ignore

            do! saveChanges db
            return true
    }

/// Archivuje nebo vrátí projekt z archivu.
///
/// Soft delete existuje proto, že tvrdé smazání bere i úkoly, přílohy a KB
/// a nejde vzít zpět — u nástroje, kde se projekty ukončují, je archiv ta
/// obvyklá operace a mazání ta výjimečná.
let setArchived (db: AppDbContext) (projectId: string) (archived: bool) : Async<bool> =
    async {
        let! row = tryFindRow db projectId

        match row with
        | None -> return false
        | Some existing ->
            db.Projects.Update
                { existing with
                    ArchivedAt = if archived then nowIso () else null
                }
            |> ignore

            do! saveChanges db
            return true
    }

/// Je projekt archivovaný? Tvrdě smazat jde až archivovaný projekt.
let isArchived (db: AppDbContext) (projectId: string) : Async<bool option> =
    async {
        let! row = tryFindRow db projectId
        return row |> Option.map (fun value -> (ofNullable value.ArchivedAt).IsSome)
    }

/// Smaže projekt; členství, přílohy a ADO credentials padají kaskádou.
let delete (db: AppDbContext) (projectId: string) : Async<bool> =
    async {
        let! row = tryFindRow db projectId

        match row with
        | None -> return false
        | Some existing ->
            db.Projects.Remove existing |> ignore
            do! saveChanges db
            return true
    }
