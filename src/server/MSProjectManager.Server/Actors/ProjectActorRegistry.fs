/// Registr actorů (ADR-002) — jeden actor na otevřený projekt.
///
/// Singleton držený DI kontejnerem; `IHostedService` je tu kvůli vypnutí
/// služby: než proces skončí, musí všechny aktory uložit stav.
module MSProjectManager.Actors.ProjectActorRegistry

open System
open System.Collections.Concurrent
open System.Threading
open System.Threading.Tasks
open Microsoft.Extensions.Hosting
open Microsoft.Extensions.Logging
open MSProjectManager.Domain.Diffs
open MSProjectManager.Domain.AdoGateway
open MSProjectManager.Actors.ProjectStore
open MSProjectManager.Actors.ProjectActor

/// Závislosti sdílené všemi actory. Držíme je v záznamu, ať konstruktor
/// registru nepřeroste limit počtu parametrů (ADR-012).
[<NoEquality; NoComparison>]
type RegistryDependencies =
    {
        Store: ProjectStore
        Options: ActorOptions
        Ado: AdoGateway
        /// `projectId` → `userId` → diffy. Rozeslání mimo odpověď na command —
        /// tudy chodí výsledky dlouhých ADO operací (ADR-008).
        Publish: string -> string -> ProjectDiff list -> unit
    }

    /// Bez ADO a bez rozesílání — pro testy a servery bez ADO integrace.
    static member Basic(store, options) =
        {
            Store = store
            Options = options
            Ado = AdoGateway.Disabled
            Publish = fun _ _ _ -> ()
        }

/// Jak dlouho se čeká na uložení při `Retire`. Actor, který nereaguje, nesmí
/// zablokovat HTTP request na archivaci.
[<Literal>]
let private FlushTimeoutMs = 5000

type ProjectActorRegistry(deps: RegistryDependencies, logger: ILogger<ProjectActorRegistry>) =
    let actors = ConcurrentDictionary<string, Lazy<ProjectActor>>()

    let remove (projectId: string) =
        match actors.TryRemove projectId with
        | true, actor when actor.IsValueCreated -> (actor.Value :> IDisposable).Dispose()
        | _ -> ()

    /// `Publish` se curryuje projektem, protože actor svoje `projectId` do
    /// callbacku nepředává — zná ho jen registr.
    let dependenciesFor (projectId: string) =
        {
            Store = deps.Store
            Options = deps.Options
            Ado = deps.Ado
            Publish = deps.Publish projectId
            OnStopped =
                fun stopped ->
                    logger.LogInformation("Actor projektu {ProjectId} končí po nečinnosti", stopped)
                    actors.TryRemove stopped |> ignore
            OnError = fun failed ex -> logger.LogError(ex, "Chyba v actoru projektu {ProjectId}", failed)
        }

    /// Actor projektu; vytvoří se při prvním použití. `Lazy` brání tomu, aby
    /// souběžné `GetOrAdd` spustily dva aktory nad týmž projektem.
    member _.Get(projectId: string) =
        actors.GetOrAdd(projectId, fun id -> lazy (new ProjectActor(id, dependenciesFor id))).Value

    /// Počet actorů v paměti — pro diagnostiku a testy.
    member _.Count = actors.Count

    /// Zahodí actor projektu **bez uložení** — jen tam, kde stav stejně
    /// zaniká (smazání projektu, testy).
    member _.Evict(projectId: string) = remove projectId

    /// Uloží stav a teprve pak actor zahodí.
    ///
    /// `Dispose` sám neflushuje, takže `Evict` u živého projektu zahodí
    /// všechno, co se ještě nestihlo persistovat (až `PersistInterval`
    /// sekund práce). Archivace tudy proto chodí sem, ne přes `Evict`.
    member _.Retire(projectId: string) =
        async {
            match actors.TryGetValue projectId with
            | true, actor when actor.IsValueCreated -> do! actor.Value.Flush FlushTimeoutMs
            | _ -> ()

            remove projectId
        }

    /// Uloží stav všech běžících actorů.
    member _.FlushAll() =
        actors.Values
        |> Seq.filter (fun actor -> actor.IsValueCreated)
        |> Seq.map (fun actor -> actor.Value.Flush())
        |> Async.Sequential
        |> Async.Ignore

    interface IHostedService with
        member _.StartAsync(_cancellation: CancellationToken) = Task.CompletedTask

        member this.StopAsync(_cancellation: CancellationToken) =
            task {
                logger.LogInformation("Ukládám stav {Count} běžících projektů", actors.Count)
                do! this.FlushAll() |> Async.StartAsTask :> Task

                for actor in actors.Values do
                    if actor.IsValueCreated then
                        (actor.Value :> IDisposable).Dispose()

                actors.Clear()
            }
            :> Task
