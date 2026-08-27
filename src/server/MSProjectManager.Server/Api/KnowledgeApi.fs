/// Historie KB stránek (`knowledge-base.feature`).
///
/// Čtení historie je REST, ne SignalR: revize nejsou součástí stavu projektu
/// a nikoho nezajímají, dokud si o ně neřekne. Obnovení verze naopak REST
/// **není** — klient pošle běžný `update_kb_page` s obsahem revize, takže
/// projde stejnou cestou jako každá editace (oprávnění, diffy, offline fronta).
module MSProjectManager.Api.KnowledgeApi

open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repositories
open MSProjectManager.Realtime.Membership
open MSProjectManager.Api.Contracts
open MSProjectManager.Api.Http

let private db (ctx: HttpContext) = service<AppDbContext> ctx
let private membership (ctx: HttpContext) = service<MembershipCache> ctx

/// `GET /api/projects/{id}/kb/{pageId}/revisions` — kterýkoli člen projektu.
///
/// Historii smí číst i Dev: je to stejný obsah, jaký na stránce vidí, jen
/// v dřívějším znění.
let revisions (ctx: HttpContext) (projectId: string, pageId: string) : Task<IResult> =
    task {
        match! (membership ctx).TryGetRole(projectId, userId ctx) |> Async.StartAsTask with
        | None -> return forbidden "Nejste členem tohoto projektu"
        | Some _ ->
            let! history = KbRevisions.list (db ctx) projectId pageId

            return
                history
                |> List.map (fun revision ->
                    {
                        Id = revision.Id
                        Title = revision.Title
                        Content = revision.Content
                        SavedAt = revision.SavedAt
                        SavedBy = revision.SavedBy
                    }
                )
                |> Results.Json
    }
