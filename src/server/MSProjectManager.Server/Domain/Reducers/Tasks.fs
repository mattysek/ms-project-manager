/// Reducer doménového slice „úkoly".
module MSProjectManager.Domain.Reducers.Tasks

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Common.Collections

let private taskId (task: Task) = task.Id

/// Razítko „kdo a kdy naposledy sáhl". Jde jako jedna hodnota, ne dva
/// parametry — mutační funkce by jinak měly pět argumentů (FL0052).
type private Stamp = { By: string; At: string }

/// Doplní razítko do patche úkolu, takže se stejnou cestou dostane do stavu
/// i do diffu pro ostatní klienty. Klientem poslané hodnoty se tím vždycky
/// přepíšou — spoofnout autora nejde.
let private withStamp (stamp: Stamp) (fields: TaskFields) =
    { fields with
        UpdatedBy = Some stamp.By
        UpdatedAt = Some stamp.At
    }

let private withTask (state: AppState) (id: string) (change: Task -> Result<AppState * ProjectDiff list, string>) =
    match tryFindById taskId id state.Tasks with
    | Some task -> change task
    | None -> Error $"Úkol {id} v projektu neexistuje"

let private add (state: AppState) (stamp: Stamp) (task: Task) =
    if containsId taskId task.Id state.Tasks then
        Error $"Úkol {task.Id} v projektu už existuje"
    else
        let stamped =
            { task with
                UpdatedBy = Some stamp.By
                UpdatedAt = Some stamp.At
            }

        Ok(
            { state with
                Tasks = append stamped state.Tasks
            },
            [ TaskAdded stamped ]
        )

let private update (state: AppState) (stamp: Stamp) (id: string) (fields: TaskFields) =
    withTask
        state
        id
        (fun _ ->
            let stamped = withStamp stamp fields
            let tasks = updateById taskId id (mergeTask stamped) state.Tasks
            Ok({ state with Tasks = tasks }, [ TaskUpdated(id, stamped) ])
        )

let private move (state: AppState) (stamp: Stamp) (id: string) (range: int * int) =
    let start, finish = range

    if start < 0 || finish < start then
        Error $"Neplatný rozsah týdnů: {start}–{finish}"
    else
        withTask
            state
            id
            (fun _ ->
                let fields =
                    withStamp
                        stamp
                        { emptyTaskFields with
                            S = Some start
                            E = Some finish
                        }

                let tasks = updateById taskId id (mergeTask fields) state.Tasks
                Ok({ state with Tasks = tasks }, [ TaskUpdated(id, fields) ])
            )

let private updateProgress (state: AppState) (stamp: Stamp) (id: string) (progress: int) =
    if progress < 0 || progress > 100 then
        Error $"Progress musí být v rozsahu 0–100, přišlo {progress}"
    else
        withTask
            state
            id
            (fun _ ->
                let fields =
                    withStamp
                        stamp
                        { emptyTaskFields with
                            Progress = Some progress
                        }

                let tasks = updateById taskId id (mergeTask fields) state.Tasks
                Ok({ state with Tasks = tasks }, [ TaskUpdated(id, fields) ])
            )

let private delete (state: AppState) (id: string) =
    withTask
        state
        id
        (fun _ ->
            Ok(
                { state with
                    Tasks = removeById taskId id state.Tasks
                },
                [ TaskDeleted id ]
            )
        )

/// Aplikuje command nad úkoly.
let apply
    (state: AppState)
    (user: UserContext)
    (now: string)
    (command: TaskCommand)
    : Result<AppState * ProjectDiff list, string> =
    let stamp = { By = user.DisplayName; At = now }

    match command with
    | AddTask task -> add state stamp task
    | UpdateTask(id, fields) -> update state stamp id fields
    | MoveTask(id, start, finish) -> move state stamp id (start, finish)
    | UpdateProgress(id, progress) -> updateProgress state stamp id progress
    | DeleteTask id -> delete state id
