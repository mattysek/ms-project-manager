/// Reducer doménového slice „znalostní báze".
module MSProjectManager.Domain.Reducers.Knowledge

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Common.Collections

let private pageId (page: KbPage) = page.Id

let private add (state: AppState) (page: KbPage) =
    if containsId pageId page.Id state.KbPages then
        Error $"KB stránka {page.Id} v projektu už existuje"
    else
        Ok(
            { state with
                KbPages = append page state.KbPages
            },
            [ KbPageAdded page ]
        )

let private update (state: AppState) (id: string) (fields: KbPageFields) =
    if containsId pageId id state.KbPages then
        let pages = updateById pageId id (mergeKbPage fields) state.KbPages
        Ok({ state with KbPages = pages }, [ KbPageUpdated(id, fields) ])
    else
        Error $"KB stránka {id} v projektu neexistuje"

let private delete (state: AppState) (id: string) =
    if containsId pageId id state.KbPages then
        Ok(
            { state with
                KbPages = removeById pageId id state.KbPages
            },
            [ KbPageDeleted id ]
        )
    else
        Error $"KB stránka {id} v projektu neexistuje"

/// Aplikuje command nad KB stránkami.
let apply (state: AppState) (command: KnowledgeCommand) : Result<AppState * ProjectDiff list, string> =
    match command with
    | AddKbPage page -> add state page
    | UpdateKbPage(id, fields) -> update state id fields
    | DeleteKbPage id -> delete state id
