/// Reducer doménového slice „přílohy".
///
/// Ve stavu projektu jsou jen metadata; obsah souboru je BLOB v tabulce
/// `files` a chodí přes REST (ADR-010). Commandy sem posílá server po
/// úspěšném uploadu nebo smazání, aby se metadata dostala ke klientům
/// stejnou cestou jako každá jiná změna.
module MSProjectManager.Domain.Reducers.Files

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Common.Collections

let private fileId (file: FileRef) = file.Id

let private add (state: AppState) (file: FileRef) =
    if containsId fileId file.Id state.Files then
        Error $"Příloha {file.Id} v projektu už existuje"
    else
        Ok(
            { state with
                Files = append file state.Files
            },
            [ FileAdded file ]
        )

let private updateNote (state: AppState) (id: string) (note: string) =
    if containsId fileId id state.Files then
        let files = updateById fileId id (fun file -> { file with Note = note }) state.Files
        Ok({ state with Files = files }, [ FileNoteUpdated(id, note) ])
    else
        Error $"Příloha {id} v projektu neexistuje"

let private delete (state: AppState) (id: string) =
    if containsId fileId id state.Files then
        Ok(
            { state with
                Files = removeById fileId id state.Files
            },
            [ FileDeleted id ]
        )
    else
        Error $"Příloha {id} v projektu neexistuje"

/// Aplikuje command nad přílohami.
let apply (state: AppState) (command: FileCommand) : Result<AppState * ProjectDiff list, string> =
    match command with
    | AddFile file -> add state file
    | UpdateFileNote(id, note) -> updateNote state id note
    | DeleteFile id -> delete state id
