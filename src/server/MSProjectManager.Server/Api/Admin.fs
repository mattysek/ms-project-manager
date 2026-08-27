/// Správa uživatelských účtů (FR-AUTH-05). Účty se nemažou, jen deaktivují —
/// na userId visí data (úkoly, poznámky, přílohy).
module MSProjectManager.Api.Admin

open System.Linq
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.Identity
open Microsoft.EntityFrameworkCore
open MSProjectManager.Domain.State
open MSProjectManager.Protocol.Json
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repositories
open MSProjectManager.Api.Contracts
open MSProjectManager.Api.Http
open MSProjectManager.Api.Auth

let private users (ctx: HttpContext) = service<UserManager<AppUser>> ctx

let private toSummary (manager: UserManager<AppUser>) (user: AppUser) =
    task {
        let! roles = manager.GetRolesAsync user

        return
            {
                Id = user.Id
                UserName = user.UserName |> Option.ofObj |> Option.defaultValue ""
                DisplayName = user.DisplayName
                IsActive = user.IsActive
                IsAdmin = roles.Contains AdminRole
                OrphanedIn = []
            }
    }

/// Projekty, ve kterých má účet přiřazenou osobu s aspoň jedním úkolem.
///
/// Čte `state_json` mimo actory (viz `Projects.listWithStateForUser`) — jde
/// o informaci k zobrazení, ne o podklad pro zápis, takže pár sekund zpoždění
/// nevadí. Nečitelný stav se přeskočí: neúplný seznam je lepší než pád
/// deaktivace na jednom rozbitém projektu.
let private projectsWithAssignedWork (ctx: HttpContext) (id: string) =
    async {
        let! projects = Projects.listWithStateForUser (service<AppDbContext> ctx) id false

        return
            projects
            |> List.filter (fun project ->
                match tryDeserialize<AppState> project.StateJson with
                | Error _ -> false
                | Ok state ->
                    let owned =
                        state.People
                        |> List.filter (fun person -> person.UserId = id)
                        |> List.map (fun person -> person.Id)

                    state.Tasks |> List.exists (fun task -> List.contains task.P owned)
            )
            |> List.map (fun project -> project.Name)
    }

/// `GET /admin/users`
let list (ctx: HttpContext) : Task<IResult> =
    task {
        let manager = users ctx
        let! all = manager.Users.OrderBy(fun user -> user.DisplayName).ToListAsync()
        let! summaries = all |> Seq.map (toSummary manager) |> Task.WhenAll
        return Results.Json summaries
    }

/// `POST /admin/users`
let create (ctx: HttpContext) : Task<IResult> =
    task {
        match! readJson<CreateUserRequest> ctx with
        | None -> return badRequest "Chybí údaje účtu"
        | Some request ->
            let manager = users ctx

            let user =
                AppUser(UserName = request.UserName, DisplayName = request.DisplayName, IsActive = true)

            let! created = manager.CreateAsync(user, request.Password)

            if created.Succeeded then
                let! summary = toSummary manager user
                return Results.Json summary
            else
                return badRequest (describeIdentityErrors created)
    }

/// Deaktivace posledního PM projektu je zakázaná.
///
/// Bez téhle kontroly by projekt zůstal s PM, který se nepřihlásí — a protože
/// Admin nemá projekt-level oprávnění (PRD-00), nešlo by už doplnit jiného.
/// Projekt by osiřel natrvalo, což odebrání člena i změna role hlídají, ale
/// deaktivace to obcházela.
let private blockingProjects (ctx: HttpContext) (id: string) =
    task {
        let! projects = Members.projectsWhereSolePm (service<AppDbContext> ctx) id |> Async.StartAsTask

        return projects
    }

let private setActive (ctx: HttpContext) (id: string) (active: bool) =
    task {
        let manager = users ctx
        let! user = manager.FindByIdAsync id

        let! blocking =
            if active then
                Task.FromResult []
            else
                blockingProjects ctx id

        match Option.ofObj user with
        | None -> return notFound "Uživatel neexistuje"
        | Some _ when not (List.isEmpty blocking) ->
            let names = String.concat ", " blocking

            return
                badRequest
                    $"Účet nelze deaktivovat: uživatel je jediným Project Managerem projektů {names}. Nejdřív přiřaďte jiného PM."
        | Some found ->
            found.IsActive <- active
            let! updated = manager.UpdateAsync found

            if updated.Succeeded then
                // Deaktivovaný účet nesmí dál používat vydanou cookie — změna
                // security stampu zneplatní existující session.
                let! _ = manager.UpdateSecurityStampAsync found
                let! summary = toSummary manager found

                let! orphaned =
                    if active then
                        Task.FromResult []
                    else
                        projectsWithAssignedWork ctx id |> Async.StartAsTask

                return Results.Json { summary with OrphanedIn = orphaned }
            else
                return badRequest (describeIdentityErrors updated)
    }

/// `POST /admin/users/{id}/deactivate`
let deactivate (ctx: HttpContext) (id: string) = setActive ctx id false

/// `POST /admin/users/{id}/activate`
let activate (ctx: HttpContext) (id: string) = setActive ctx id true

/// `POST /admin/users/{id}/reset-password` — admin nezadává staré heslo.
let resetPassword (ctx: HttpContext) (id: string) : Task<IResult> =
    task {
        match! readJson<ResetPasswordRequest> ctx with
        | None -> return badRequest "Chybí nové heslo"
        | Some request ->
            let manager = users ctx
            let! user = manager.FindByIdAsync id

            match Option.ofObj user with
            | None -> return notFound "Uživatel neexistuje"
            | Some found ->
                let! token = manager.GeneratePasswordResetTokenAsync found
                let! result = manager.ResetPasswordAsync(found, token, request.NewPassword)

                if result.Succeeded then
                    return Results.NoContent()
                else
                    return badRequest (describeIdentityErrors result)
    }
