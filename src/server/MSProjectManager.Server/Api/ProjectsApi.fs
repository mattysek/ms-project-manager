/// Projekty a jejich členové (PRD-00, FR-ROLE-02).
module MSProjectManager.Api.ProjectsApi

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.Identity
open Microsoft.EntityFrameworkCore
open System.Linq
open Microsoft.AspNetCore.SignalR
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Realtime.ProjectHub
open MSProjectManager.Protocol.Json
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repository
open MSProjectManager.Persistence.Repositories
open MSProjectManager.Actors.ProjectActorRegistry
open MSProjectManager.Realtime.Membership
open MSProjectManager.Api.Contracts
open MSProjectManager.Api.Http

let private db (ctx: HttpContext) = service<AppDbContext> ctx
let private membership (ctx: HttpContext) = service<MembershipCache> ctx
let private registry (ctx: HttpContext) = service<ProjectActorRegistry> ctx

/// Pošle `role_changed` **dotčenému** uživateli (ADR-004, routing diffů).
///
/// Změna role jde přes REST, ne přes actor, takže tenhle diff nikdy neprojde
/// `publishDiffs`. Adresuje se tedy tady a ručně. V `senderOnlyCases` přesto
/// zůstává jako pojistka: kdyby ho někdo v budoucnu pustil actorem, nesmí
/// skončit broadcastem celé skupině.
let private notifyRoleChanged (ctx: HttpContext) (memberId: string) (role: ProjectRole) =
    let hub = service<IHubContext<ProjectHub>> ctx
    hub.Clients.User(memberId).SendAsync("ReceiveDiff", RoleChanged role)

/// Zruší vazbu osoby na účet odebraného člena (ADR-006, doplněk o mapování).
///
/// Bez toho by osoba zůstala navázaná na účet, který do projektu už nesmí —
/// a po jeho vrácení by mu tiše vrátila práva k úkolům, o kterých mezitím nic
/// neví. Členství není součástí `AppState`, takže to nemůže udělat reducer;
/// jde to přes actor stejným způsobem jako `FilesApi.announce`, aby změnu
/// dostali všichni klienti jako `person_updated`.
let private unlinkPersonOf (ctx: HttpContext) (projectId: string) (memberId: string) =
    task {
        let actor = (registry ctx).Get projectId
        let! snapshot = actor.FullState(userId ctx) |> Async.StartAsTask

        let linked =
            match snapshot with
            | Ok state -> state.People |> List.filter (fun person -> person.UserId = memberId)
            | Error _ -> []

        let user: UserContext =
            {
                UserId = userId ctx
                DisplayName = displayName ctx
                Role = Pm
            }

        let hub = service<IHubContext<ProjectHub>> ctx

        let fields =
            { emptyPersonFields with
                UserId = Some null
            }

        for person in linked do
            match! actor.Execute(user, PeopleCmd(UpdatePerson(person.Id, fields))) |> Async.StartAsTask with
            | Ok diffs ->
                for diff in diffs do
                    do! hub.Clients.Group(groupOf projectId).SendAsync("ReceiveDiff", diff)
            | Error _ -> ()
    }

/// Ověří, že je uživatel členem, a případně že je PM.
let private requireRole (ctx: HttpContext) (projectId: string) (needsPm: bool) =
    task {
        match! (membership ctx).TryGetRole(projectId, userId ctx) |> Async.StartAsTask with
        | None -> return Error(forbidden "Nejste členem tohoto projektu")
        | Some Dev when needsPm ->
            return Error(forbidden "Nedostatečná oprávnění: tato akce vyžaduje roli Project Manager")
        | Some role -> return Ok role
    }

/// `GET /api/projects`
let list (ctx: HttpContext) : Task<IResult> =
    task {
        let! projects = Projects.listForUser (db ctx) (userId ctx)

        return
            projects
            |> List.map (fun summary ->
                {
                    Id = summary.Id
                    Name = summary.Name
                    Role = summary.Role
                    UpdatedAt = summary.UpdatedAt
                    ArchivedAt = summary.ArchivedAt
                }
            )
            |> Results.Json
    }

/// `POST /api/projects` — zakladatel se stává PM.
let create (ctx: HttpContext) : Task<IResult> =
    task {
        match! readJson<CreateProjectRequest> ctx with
        | None -> return badRequest "Chybí název projektu"
        | Some request when String.IsNullOrWhiteSpace request.Name ->
            return badRequest "Název projektu nesmí být prázdný"
        | Some request ->
            let projectId = Guid.NewGuid().ToString "N"
            let state = initial request.Name

            do!
                Projects.create
                    (db ctx)
                    {
                        Id = projectId
                        Name = request.Name
                        StateJson = serialize state
                        OwnerId = userId ctx
                    }

            (membership ctx).Invalidate(projectId, userId ctx)

            return
                Results.Json
                    {
                        Id = projectId
                        Name = request.Name
                        Role = Pm
                        UpdatedAt = nowIso ()
                        ArchivedAt = None
                    }
    }

/// `POST /api/projects/{id}/archive` a `/unarchive` — jen PM.
///
/// Archivace je běžná operace na konci projektu, mazání ta výjimečná. Actor
/// se při archivaci uspí, ať v paměti nevisí projekt, do kterého nikdo nechodí.
let private setArchived (ctx: HttpContext) (projectId: string) (archived: bool) : Task<IResult> =
    task {
        match! requireRole ctx projectId true with
        | Error result -> return result
        | Ok _ ->
            let! changed = Projects.setArchived (db ctx) projectId archived

            if changed then
                // Bez invalidace by hub jel dál podle staré hodnoty: čerstvě
                // archivovaný projekt by šlo pořád editovat a vrácený z archivu
                // by naopak zůstal zamčený, dokud se cache sama nezahodí.
                (membership ctx).InvalidateProject projectId

                if archived then
                    // `Retire`, ne `Evict`: archivovaný projekt si musí odnést
                    // i změny, které actor ještě nestihl uložit.
                    do! (registry ctx).Retire projectId |> Async.StartAsTask

                return Results.NoContent()
            else
                return notFound "Projekt neexistuje"
    }

let archive (ctx: HttpContext) (projectId: string) = setArchived ctx projectId true
let unarchive (ctx: HttpContext) (projectId: string) = setArchived ctx projectId false

/// `DELETE /api/projects/{id}` — jen PM a jen nad archivovaným projektem.
///
/// Dvoukrokovost je schválně: smazání bere i úkoly, přílohy a KB a nejde
/// vzít zpět, takže se k němu nedá dostat jedním kliknutím ze seznamu.
let delete (ctx: HttpContext) (projectId: string) : Task<IResult> =
    task {
        match! requireRole ctx projectId true with
        | Error result -> return result
        | Ok _ ->
            match! Projects.isArchived (db ctx) projectId with
            | None -> return notFound "Projekt neexistuje"
            | Some false -> return badRequest "Smazat lze jen archivovaný projekt. Nejdřív ho archivujte."
            | Some true ->
                let! deleted = Projects.delete (db ctx) projectId

                if deleted then
                    (registry ctx).Evict projectId
                    (membership ctx).InvalidateProject projectId
                    return Results.NoContent()
                else
                    return notFound "Projekt neexistuje"
    }

/// `GET /api/projects/{id}/members`
let listMembers (ctx: HttpContext) (projectId: string) : Task<IResult> =
    task {
        match! requireRole ctx projectId false with
        | Error result -> return result
        | Ok _ ->
            let! members = Members.list (db ctx) projectId

            return
                members
                |> List.map (fun entry ->
                    {
                        UserId = entry.UserId
                        DisplayName = entry.DisplayName
                        Role = entry.Role
                        JoinedAt = entry.JoinedAt
                    }
                )
                |> Results.Json
    }

/// `GET /api/projects/{id}/candidates` — aktivní uživatelé, které lze do
/// projektu přidat.
///
/// FR-ROLE-02 dává právo přidávat členy PM, ne jen Adminovi. Seznam účtů byl
/// ale dostupný výhradně přes `/admin/users`, takže PM bez admin role neměl
/// z čeho vybírat. Endpoint proto vrací **jen** id a zobrazované jméno —
/// nic z toho, co je na `/admin/users` (uživatelské jméno, stav účtu, admin
/// příznak), a jen členům projektu s rolí PM.
let listCandidates (ctx: HttpContext) (projectId: string) : Task<IResult> =
    task {
        match! requireRole ctx projectId true with
        | Error result -> return result
        | Ok _ ->
            let! members = Members.list (db ctx) projectId
            let existing = members |> List.map (fun entry -> entry.UserId) |> Set.ofList
            let manager = service<UserManager<AppUser>> ctx
            let! all = manager.Users.Where(fun user -> user.IsActive).ToListAsync()

            let candidates: MemberCandidate list =
                all
                |> Seq.filter (fun user -> not (existing.Contains user.Id))
                |> Seq.sortBy (fun user -> user.DisplayName)
                |> Seq.map (fun user ->
                    {
                        UserId = user.Id
                        DisplayName = user.DisplayName
                    }
                )
                |> Seq.toList

            return Results.Json candidates
    }

let private parseRole (value: string) =
    match roleOfText value with
    | Some role -> Ok role
    | None -> Error(badRequest "Role musí být 'pm' nebo 'dev'")

/// `POST /api/projects/{id}/members` — jen PM.
let addMember (ctx: HttpContext) (projectId: string) : Task<IResult> =
    task {
        match! requireRole ctx projectId true with
        | Error result -> return result
        | Ok _ ->
            match! readJson<AddMemberRequest> ctx with
            | None -> return badRequest "Chybí uživatel"
            | Some request ->
                match parseRole request.Role with
                | Error result -> return result
                | Ok role ->
                    let! added =
                        Members.add
                            (db ctx)
                            {
                                ProjectId = projectId
                                UserId = request.UserId
                                Role = role
                            }

                    (membership ctx).Invalidate(projectId, request.UserId)
                    return added |> ofResult (fun () -> Results.NoContent())
    }

/// `PUT /api/projects/{id}/members/{userId}` — jen PM.
let setMemberRole (ctx: HttpContext) (projectId: string, memberId: string) : Task<IResult> =
    task {
        match! requireRole ctx projectId true with
        | Error result -> return result
        | Ok _ ->
            match! readJson<ChangeMemberRoleRequest> ctx with
            | None -> return badRequest "Chybí role"
            | Some request ->
                match parseRole request.Role with
                | Error result -> return result
                | Ok role ->
                    let! changed =
                        Members.setRole
                            (db ctx)
                            {
                                ProjectId = projectId
                                UserId = memberId
                                Role = role
                            }

                    (membership ctx).Invalidate(projectId, memberId)

                    match changed with
                    | Ok() -> do! notifyRoleChanged ctx memberId role
                    | Error _ -> ()

                    return changed |> ofResult (fun () -> Results.NoContent())
    }

/// `DELETE /api/projects/{id}/members/{userId}` — jen PM a ne sám sebe.
let removeMember (ctx: HttpContext) (projectId: string, memberId: string) : Task<IResult> =
    task {
        match! requireRole ctx projectId true with
        | Error result -> return result
        | Ok _ when memberId = userId ctx ->
            return badRequest "Sám sebe z projektu odebrat nelze — nejdřív přiřaďte jiného PM"
        | Ok _ ->
            let! removed = Members.remove (db ctx) projectId memberId
            (membership ctx).Invalidate(projectId, memberId)

            match removed with
            | Ok() -> do! unlinkPersonOf ctx projectId memberId
            | Error _ -> ()

            return removed |> ofResult (fun () -> Results.NoContent())
    }
