/// Historie KB stránek.
///
/// Revize se zapisuje **před** změnou: ukládá se předchozí znění, takže
/// „obnovit verzi z 12. 8." znamená vzít obsah revize a poslat ho běžným
/// `update_kb_page` commandem. Díky tomu obnovení projde stejnou cestou jako
/// každá jiná editace — včetně oprávnění, diffů a offline fronty.
module MSProjectManager.Persistence.Repositories.KbRevisions

open System
open System.Linq
open Microsoft.EntityFrameworkCore
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repository

/// Kolik revizí na stránku držíme. Historie má sloužit k „vrať to, co jsem
/// před chvílí přepsal", ne jako archiv — starší se ořezávají.
[<Literal>]
let MaxRevisionsPerPage = 50

/// Jedna uložená verze stránky.
type KbRevision =
    {
        Id: string
        PageId: string
        Title: string
        Content: string
        SavedAt: string
        SavedBy: string
    }

/// Uloží předchozí znění stránky a ořízne historii na `MaxRevisionsPerPage`.
let append (db: AppDbContext) (projectId: string) (revision: KbRevision) : Async<unit> =
    async {
        db.KbRevisions.Add
            {
                Id = Guid.NewGuid().ToString "N"
                ProjectId = projectId
                PageId = revision.PageId
                Title = revision.Title
                Content = revision.Content
                SavedAt = revision.SavedAt
                SavedBy = revision.SavedBy
            }
        |> ignore

        do! saveChanges db

        let! stale =
            db.KbRevisions
                .Where(fun row -> row.ProjectId = projectId && row.PageId = revision.PageId)
                .OrderByDescending(fun row -> row.SavedAt)
                .Skip(MaxRevisionsPerPage)
                .ToListAsync()
            |> Async.AwaitTask

        if stale.Count > 0 then
            db.KbRevisions.RemoveRange stale
            do! saveChanges db
    }

/// Historie jedné stránky, od nejnovější.
let list (db: AppDbContext) (projectId: string) (pageId: string) : Async<KbRevision list> =
    async {
        let! rows =
            db.KbRevisions
                .AsNoTracking()
                .Where(fun row -> row.ProjectId = projectId && row.PageId = pageId)
                .ToListAsync()
            |> Async.AwaitTask

        return
            rows
            |> Seq.sortByDescending (fun row -> row.SavedAt)
            |> Seq.map (fun row ->
                {
                    Id = row.Id
                    PageId = row.PageId
                    Title = row.Title
                    Content = row.Content
                    SavedAt = row.SavedAt
                    SavedBy = row.SavedBy
                }
            )
            |> Seq.toList
    }
