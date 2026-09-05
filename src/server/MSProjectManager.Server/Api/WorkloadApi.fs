/// Přehled práce přihlášeného uživatele napříč projekty (PRD-08, ADR-015).
///
/// Jediné místo v aplikaci, které čte víc projektů najednou. Actory se
/// **obcházejí schválně**: `ProjectActorRegistry.Get` by na dotaz probudil
/// actor každého projektu, do kterého uživatel patří, a držel ho v paměti
/// dalších 15 minut (`IdleTimeout`) — kvůli obrazovce, která nic nemění. To by
/// šlo proti ADR-002, kde actor existuje kvůli serializaci **zápisů**.
///
/// Daň je zpoždění: actor persistuje po ticku (`PersistInterval`, 5 s), takže
/// tahle projekce může být o tolik pozadu. Pro „co mám tenhle týden" to stačí
/// a UI to říká nahlas; pro rozhodování o zápisu by to nestačilo, a proto se
/// odsud nic nezapisuje.
module MSProjectManager.Api.WorkloadApi

open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Protocol.Json
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repositories
open MSProjectManager.Api.Contracts
open MSProjectManager.Api.Http

module Weeks = MSProjectManager.Domain.Weeks

let private db (ctx: HttpContext) = service<AppDbContext> ctx

/// Osoby, které v tomhle projektu patří danému účtu (ADR-006 — nikdy podle `Person.Id`).
let private ownedPersonIds (state: AppState) (userId: string) =
    state.People
    |> List.filter (fun person -> person.UserId = userId)
    |> List.map (fun person -> person.Id)
    |> Set.ofList

let private toResponse (project: Projects.ProjectWithState) (state: AppState) (task: Task) =
    {
        ProjectId = project.Id
        ProjectName = project.Name
        TaskId = task.Id
        Name = task.Name
        Cat = task.Cat
        Md = task.Md
        Progress = task.Progress
        FromIso = Weeks.weekStartIso state.Project.StartDate task.S
        ToIso = Weeks.weekEndIso state.Project.StartDate task.E
    }

/// Moje úkoly v jednom projektu. Nečitelný stav projekt přeskočí — jeden
/// rozbitý `state_json` nesmí shodit celý přehled.
let private tasksOf (userId: string) (project: Projects.ProjectWithState) =
    match tryDeserialize<AppState> project.StateJson with
    | Error _ -> []
    | Ok state ->
        let mine = ownedPersonIds state userId

        state.Tasks
        |> List.filter (fun task -> mine.Contains task.P)
        |> List.map (toResponse project state)

/// `GET /api/me/workload` — moje úkoly ze všech neaerchivovaných projektů.
///
/// Archivované se vynechávají: je to přehled rozdělané práce, ne archiv.
let mine (ctx: HttpContext) : Task<IResult> =
    task {
        let user = userId ctx
        let! projects = Projects.listWithStateForUser (db ctx) user false |> Async.StartAsTask

        let tasks =
            projects
            |> List.collect (tasksOf user)
            |> List.sortBy (fun task -> (task.FromIso, task.ProjectName, task.Name))

        return Results.Json { StaleAfterSeconds = 5; Tasks = tasks }
    }
