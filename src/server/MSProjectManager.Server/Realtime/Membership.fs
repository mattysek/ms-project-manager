/// Role uživatele v projektu s cache (PRD-03: permission check pod 1 ms).
///
/// Role se mění zřídka (správa členů), ale čte se u každého commandu — proto
/// cache v paměti, kterou správa členů invaliduje.
module MSProjectManager.Realtime.Membership

open System.Collections.Concurrent
open Microsoft.Extensions.DependencyInjection
open MSProjectManager.Domain.State
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repositories

type MembershipCache(scopeFactory: IServiceScopeFactory) =
    let roles = ConcurrentDictionary<string * string, ProjectRole>()
    let archived = ConcurrentDictionary<string, bool>()

    /// Role uživatele v projektu; `None` znamená „není členem".
    member _.TryGetRole(projectId: string, userId: string) =
        async {
            match roles.TryGetValue((projectId, userId)) with
            | true, role -> return Some role
            | _ ->
                use scope = scopeFactory.CreateScope()
                let db = scope.ServiceProvider.GetRequiredService<AppDbContext>()
                let! role = Members.tryGetRole db projectId userId

                match role with
                | Some value ->
                    roles.[(projectId, userId)] <- value
                    return Some value
                | None -> return None
        }

    /// Je projekt archivovaný? Čte se u každého mutujícího commandu, takže
    /// stejně jako role potřebuje cache — archivace je operace jednou za
    /// projekt, kdežto tenhle dotaz padá na každou změnu úkolu.
    ///
    /// Neexistující projekt vrací `false`: „archivovaný" je stav existujícího
    /// projektu, neexistenci hlásí členství o krok dřív.
    member _.IsArchived(projectId: string) =
        async {
            match archived.TryGetValue projectId with
            | true, value -> return value
            | _ ->
                use scope = scopeFactory.CreateScope()
                let db = scope.ServiceProvider.GetRequiredService<AppDbContext>()
                let! state = Projects.isArchived db projectId
                let value = defaultArg state false
                archived.[projectId] <- value
                return value
        }

    /// Zahodí cache uživatele — volá správa členů po každé změně.
    member _.Invalidate(projectId: string, userId: string) =
        roles.TryRemove((projectId, userId)) |> ignore

    /// Zahodí cache celého projektu (archivace, smazání projektu).
    member _.InvalidateProject(projectId: string) =
        archived.TryRemove projectId |> ignore

        for key in roles.Keys do
            if fst key = projectId then
                roles.TryRemove key |> ignore
