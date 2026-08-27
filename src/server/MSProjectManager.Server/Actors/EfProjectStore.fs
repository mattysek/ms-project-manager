/// Napojení actoru na databázi.
///
/// Actor je singleton, `AppDbContext` je scoped — každá operace si proto
/// otevře vlastní scope. Stav se ukládá jako JSON ve stejném tvaru, v jakém
/// odchází na wire (modul Json), takže `state_json` jde číst i ručně.
module MSProjectManager.Actors.EfProjectStore

open Microsoft.Extensions.DependencyInjection
open MSProjectManager.Domain.State
open MSProjectManager.Protocol.Json
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repositories
open MSProjectManager.Actors.ProjectStore

let private inScope (scopeFactory: IServiceScopeFactory) (work: AppDbContext -> Async<'T>) =
    async {
        use scope = scopeFactory.CreateScope()
        let db = scope.ServiceProvider.GetRequiredService<AppDbContext>()
        return! work db
    }

/// Store nad EF Core.
let create (scopeFactory: IServiceScopeFactory) : ProjectStore =
    {
        Load =
            fun projectId ->
                inScope
                    scopeFactory
                    (fun db ->
                        async {
                            let! json = Projects.tryLoadState db projectId
                            return json |> Option.map deserialize<AppState>
                        }
                    )
        Save =
            fun projectId state ->
                inScope
                    scopeFactory
                    (fun db ->
                        Projects.saveState
                            db
                            projectId
                            {
                                Name = state.Project.Name
                                StateJson = serialize state
                            }
                    )
        ArchiveKbPage =
            fun projectId snapshot ->
                inScope
                    scopeFactory
                    (fun db ->
                        KbRevisions.append
                            db
                            projectId
                            {
                                Id = ""
                                PageId = snapshot.PageId
                                Title = snapshot.Title
                                Content = snapshot.Content
                                SavedAt = snapshot.SavedAt
                                SavedBy = snapshot.SavedBy
                            }
                    )
    }
