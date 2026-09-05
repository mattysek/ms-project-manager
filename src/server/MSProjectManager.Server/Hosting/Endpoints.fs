/// Mapování REST endpointů a hubu.
///
/// Handlery berou `HttpContext` (viz `Api.Http`), takže se tu jen párují
/// cesty s funkcemi a nastavuje autorizace.
module MSProjectManager.Hosting.Endpoints

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.Routing
open MSProjectManager.Realtime.ProjectHub
open MSProjectManager.Api

type private Handler = Func<HttpContext, Task<IResult>>

let private handler (fn: HttpContext -> Task<IResult>) = Handler fn

/// Handler s jedním id v cestě.
let private withId (fn: HttpContext -> string -> Task<IResult>) =
    Handler(fun ctx -> fn ctx (Http.routeValue ctx "id"))

/// Handler s id projektu a id uživatele v cestě.
let private withTwoIds (fn: HttpContext -> string * string -> Task<IResult>) =
    Handler(fun ctx -> fn ctx (Http.routeValue ctx "id", Http.routeValue ctx "userId"))

/// Handler s id projektu a id KB stránky v cestě.
let private withPageId (fn: HttpContext -> string * string -> Task<IResult>) =
    Handler(fun ctx -> fn ctx (Http.routeValue ctx "id", Http.routeValue ctx "pageId"))

/// Endpointy bez přihlášení: login a první spuštění.
let private mapAnonymous (app: IEndpointRouteBuilder) =
    app.MapPost("/auth/login", handler Auth.login) |> ignore
    app.MapGet("/auth/setup-required", handler Auth.setupRequired) |> ignore
    app.MapPost("/auth/setup", handler Auth.setup) |> ignore
    // Registrace je jediný anonymní endpoint, který zapisuje do DB — smí ji
    // vypnout konfigurace, což si hlídá sám handler (FR-AUTH-08).
    app.MapPost("/auth/register", handler Auth.register) |> ignore

let private mapAuth (app: IEndpointRouteBuilder) =
    app.MapPost("/auth/logout", handler Auth.logout).RequireAuthorization()
    |> ignore

    app.MapGet("/auth/me", handler Auth.me).RequireAuthorization() |> ignore

    app.MapPost("/auth/change-password", handler Auth.changePassword).RequireAuthorization()
    |> ignore

let private mapAdmin (app: IEndpointRouteBuilder) =
    let requireAdmin (builder: RouteHandlerBuilder) =
        builder.RequireAuthorization(fun policy -> policy.RequireRole Auth.AdminRole |> ignore)
        |> ignore

    requireAdmin (app.MapGet("/admin/users", handler Admin.list))
    requireAdmin (app.MapPost("/admin/users", handler Admin.create))
    requireAdmin (app.MapPost("/admin/users/{id}/deactivate", withId Admin.deactivate))
    requireAdmin (app.MapPost("/admin/users/{id}/activate", withId Admin.activate))
    requireAdmin (app.MapPost("/admin/users/{id}/reset-password", withId Admin.resetPassword))

let private mapProjects (app: IEndpointRouteBuilder) =
    let secured (builder: RouteHandlerBuilder) =
        builder.RequireAuthorization() |> ignore

    secured (app.MapGet("/api/projects", handler ProjectsApi.list))
    secured (app.MapPost("/api/projects", handler ProjectsApi.create))
    secured (app.MapDelete("/api/projects/{id}", withId ProjectsApi.delete))
    secured (app.MapPost("/api/projects/{id}/archive", withId ProjectsApi.archive))
    secured (app.MapPost("/api/projects/{id}/unarchive", withId ProjectsApi.unarchive))

    secured (app.MapGet("/api/projects/{id}/kb/{pageId}/revisions", withPageId KnowledgeApi.revisions))
    secured (app.MapGet("/api/projects/{id}/members", withId ProjectsApi.listMembers))
    secured (app.MapGet("/api/projects/{id}/candidates", withId ProjectsApi.listCandidates))
    secured (app.MapPost("/api/projects/{id}/members", withId ProjectsApi.addMember))
    secured (app.MapPut("/api/projects/{id}/members/{userId}", withTwoIds ProjectsApi.setMemberRole))
    secured (app.MapDelete("/api/projects/{id}/members/{userId}", withTwoIds ProjectsApi.removeMember))

let private mapFiles (app: IEndpointRouteBuilder) =
    let secured (builder: RouteHandlerBuilder) =
        builder.RequireAuthorization() |> ignore

    secured (app.MapPost("/api/projects/{id}/files", withId FilesApi.upload))
    secured (app.MapGet("/api/files/{id}", withId FilesApi.download))
    secured (app.MapDelete("/api/files/{id}", withId FilesApi.remove))

let private mapQuickNotes (app: IEndpointRouteBuilder) =
    let secured (builder: RouteHandlerBuilder) =
        builder.RequireAuthorization() |> ignore

    secured (app.MapGet("/api/me/workload", handler WorkloadApi.mine))

    secured (app.MapGet("/api/quick-notes", handler QuickNotesApi.list))
    secured (app.MapPost("/api/quick-notes", handler QuickNotesApi.create))
    secured (app.MapPatch("/api/quick-notes/{id}", withId QuickNotesApi.update))
    secured (app.MapDelete("/api/quick-notes/{id}", withId QuickNotesApi.delete))

/// Trezor hesel (PRD-09). Všechno je per-user; vlastníka řeší `VaultApi`.
let private mapVault (app: IEndpointRouteBuilder) =
    let secured (builder: RouteHandlerBuilder) =
        builder.RequireAuthorization() |> ignore

    secured (app.MapGet("/api/vault", handler VaultApi.profile))
    secured (app.MapPost("/api/vault", handler VaultApi.create))
    secured (app.MapDelete("/api/vault", handler VaultApi.deleteVault))
    secured (app.MapPost("/api/vault/rekey", handler VaultApi.rekey))

    secured (app.MapGet("/api/vault/entries", handler VaultApi.list))
    secured (app.MapPost("/api/vault/entries", handler VaultApi.createEntry))
    secured (app.MapPut("/api/vault/entries/{id}", withId VaultApi.updateEntry))
    secured (app.MapDelete("/api/vault/entries/{id}", withId VaultApi.deleteEntry))

/// Vykazování práce (PRD-10). Všechno je per-user; vlastníka bere `WorkLogApi`
/// z přihlášení, takže tu není žádná projektová autorizace.
///
/// `running`, `tags` a `stop` musí být mapované samostatně — cesta
/// `/api/worklog/{id}` je pokrývá jen tvarem, ne významem. Literální segment
/// má v routingu přednost před parametrem, takže se nepřebijí.
let private mapWorkLog (app: IEndpointRouteBuilder) =
    let secured (builder: RouteHandlerBuilder) =
        builder.RequireAuthorization() |> ignore

    secured (app.MapGet("/api/worklog", handler WorkLogApi.list))
    secured (app.MapPost("/api/worklog", handler WorkLogApi.create))
    secured (app.MapGet("/api/worklog/running", handler WorkLogApi.running))
    secured (app.MapGet("/api/worklog/tags", handler WorkLogApi.tags))
    secured (app.MapPost("/api/worklog/stop", handler WorkLogApi.stop))
    secured (app.MapPut("/api/worklog/{id}", withId WorkLogApi.update))
    secured (app.MapDelete("/api/worklog/{id}", withId WorkLogApi.delete))

/// Namapuje celé API i SignalR hub.
let map (app: WebApplication) =
    mapAnonymous app
    mapAuth app
    mapAdmin app
    mapProjects app
    mapFiles app
    mapQuickNotes app
    mapVault app
    mapWorkLog app
    app.MapHub<ProjectHub>("/hubs/project") |> ignore
