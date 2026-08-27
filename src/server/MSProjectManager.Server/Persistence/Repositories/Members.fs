/// Repozitář členství v projektu (FR-ROLE-02).
///
/// Roli si actor tahá odsud před vyhodnocením každého commandu — a cachuje ji
/// per session, aby permission check zůstal pod 1 ms (PRD-03).
module MSProjectManager.Persistence.Repositories.Members

open System.Linq
open Microsoft.EntityFrameworkCore
open MSProjectManager.Domain.State
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repository

/// Člen projektu tak, jak ho vidí PM v sekci „Členové projektu".
type ProjectMember =
    {
        UserId: string
        DisplayName: string
        Role: ProjectRole
        JoinedAt: string
    }

/// Přidání nebo změna role člena.
type MemberAssignment =
    {
        ProjectId: string
        UserId: string
        Role: ProjectRole
    }

let private tryFindRow (db: AppDbContext) (projectId: string) (userId: string) =
    async {
        let! row =
            db.ProjectMembers
                .AsNoTracking()
                .FirstOrDefaultAsync(fun row -> row.ProjectId = projectId && row.UserId = userId)
            |> Async.AwaitTask

        return Option.ofObj row
    }

/// Role uživatele v projektu; `None` znamená „není členem".
let tryGetRole (db: AppDbContext) (projectId: string) (userId: string) : Async<ProjectRole option> =
    async {
        let! row = tryFindRow db projectId userId
        return row |> Option.bind (fun value -> roleOfText value.Role)
    }

/// Seznam členů projektu i s jejich zobrazovaným jménem.
let list (db: AppDbContext) (projectId: string) : Async<ProjectMember list> =
    async {
        let! rows =
            db.ProjectMembers.AsNoTracking().Where(fun row -> row.ProjectId = projectId).ToListAsync()
            |> Async.AwaitTask

        let ids = rows |> Seq.map (fun row -> row.UserId) |> Seq.toArray

        let! users =
            db.Users.AsNoTracking().Where(fun user -> ids.Contains user.Id).ToListAsync()
            |> Async.AwaitTask

        let displayName userId =
            users
            |> Seq.tryFind (fun user -> user.Id = userId)
            |> Option.map (fun user -> user.DisplayName)
            |> Option.defaultValue userId

        return
            rows
            |> Seq.choose (fun row ->
                roleOfText row.Role
                |> Option.map (fun role ->
                    {
                        UserId = row.UserId
                        DisplayName = displayName row.UserId
                        Role = role
                        JoinedAt = row.JoinedAt
                    }
                )
            )
            |> Seq.sortBy (fun entry -> entry.DisplayName)
            |> Seq.toList
    }

/// Přidá člena; opakované přidání téhož uživatele je chyba, ne tichá změna role.
let add (db: AppDbContext) (assignment: MemberAssignment) : Async<Result<unit, string>> =
    async {
        let! existing = tryFindRow db assignment.ProjectId assignment.UserId

        match existing with
        | Some _ -> return Error "Uživatel už je členem projektu"
        | None ->
            db.ProjectMembers.Add
                {
                    ProjectId = assignment.ProjectId
                    UserId = assignment.UserId
                    Role = roleToText assignment.Role
                    JoinedAt = nowIso ()
                }
            |> ignore

            do! saveChanges db
            return Ok()
    }

/// Názvy projektů, ve kterých je uživatel **jediným** PM.
///
/// Kontrola „projekt musí mít alespoň jednoho PM" existovala jen u odebrání
/// člena a změny role. Deaktivace účtu ji obcházela: projekt zůstal s PM,
/// který se nepřihlásí, a protože Admin nemá projektová oprávnění, nešlo už
/// přidat jiného. Projekt tím osiřel natrvalo.
let projectsWhereSolePm (db: AppDbContext) (userId: string) : Async<string list> =
    async {
        let! managed =
            db.ProjectMembers.AsNoTracking().Where(fun row -> row.UserId = userId && row.Role = "pm").ToListAsync()
            |> Async.AwaitTask

        let projectIds = managed |> Seq.map (fun row -> row.ProjectId) |> Seq.toArray

        let! managerRows =
            db.ProjectMembers
                .AsNoTracking()
                .Where(fun row -> projectIds.Contains row.ProjectId && row.Role = "pm")
                .ToListAsync()
            |> Async.AwaitTask

        let soleIds =
            managerRows
            |> Seq.countBy (fun row -> row.ProjectId)
            |> Seq.filter (fun (_, count) -> count <= 1)
            |> Seq.map fst
            |> Seq.toArray

        let! projects =
            db.Projects.AsNoTracking().Where(fun row -> soleIds.Contains row.Id).ToListAsync()
            |> Async.AwaitTask

        return projects |> Seq.map (fun row -> row.Name) |> Seq.sort |> Seq.toList
    }

let private countProjectManagers (db: AppDbContext) (projectId: string) =
    db.ProjectMembers.CountAsync(fun row -> row.ProjectId = projectId && row.Role = "pm")
    |> Async.AwaitTask

/// Změní roli člena. Posledního PM nelze degradovat — projekt musí mít vždy
/// alespoň jednoho (FR-ROLE-02).
let setRole (db: AppDbContext) (assignment: MemberAssignment) : Async<Result<unit, string>> =
    async {
        let! existing = tryFindRow db assignment.ProjectId assignment.UserId

        match existing with
        | None -> return Error "Uživatel není členem projektu"
        | Some row ->
            let! managers = countProjectManagers db assignment.ProjectId

            if row.Role = "pm" && assignment.Role = Dev && managers <= 1 then
                return Error "Projekt musí mít alespoň jednoho Project Managera"
            else
                db.ProjectMembers.Update
                    { row with
                        Role = roleToText assignment.Role
                    }
                |> ignore

                do! saveChanges db
                return Ok()
    }

/// Odebere člena. Posledního PM odebrat nelze; data uživatele zůstávají.
let remove (db: AppDbContext) (projectId: string) (userId: string) : Async<Result<unit, string>> =
    async {
        let! existing = tryFindRow db projectId userId

        match existing with
        | None -> return Error "Uživatel není členem projektu"
        | Some row ->
            let! managers = countProjectManagers db projectId

            if row.Role = "pm" && managers <= 1 then
                return Error "Projekt musí mít alespoň jednoho Project Managera"
            else
                db.ProjectMembers.Remove row |> ignore
                do! saveChanges db
                return Ok()
    }
