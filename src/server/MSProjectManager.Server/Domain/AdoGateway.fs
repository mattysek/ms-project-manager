/// Rozhraní mezi actorem a ADO integrací (ADR-002, ADR-008).
///
/// ADO operace trvají sekundy až desítky sekund a nesmí blokovat mailbox.
/// Actor je proto pošle mimo sebe (`AdoGateway.Run`) a zpět dostane seznam
/// **efektů** — popis toho, co se má se stavem stát. Efekty se aplikují až
/// v mailboxu, takže mutace stavu zůstává sekvenční a testovatelná bez sítě.
module MSProjectManager.Domain.AdoGateway

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs

/// Co má actor po doběhnutí ADO operace udělat.
type AdoEffect =
    /// Záznam do sync logu (FR-ADO-10). Log je append-only audit.
    | AppendLog of entry: AdoSyncLogEntry
    | PatchTask of taskId: string * fields: TaskFields
    | CreateTask of task: Task
    /// Diff, který stav nemění (výsledek syncu, chyba, stav PATu).
    | Emit of diff: ProjectDiff

/// Mění efekt stav projektu? Rozhoduje o tom, jestli je potřeba persist.
let mutatesState (effect: AdoEffect) =
    match effect with
    | Emit _ -> false
    | AppendLog _
    | PatchTask _
    | CreateTask _ -> true

let private applyEffect (author: string) (now: string) (state: AppState, diffs: ProjectDiff list) (effect: AdoEffect) =
    let stamp (fields: TaskFields) =
        { fields with
            UpdatedBy = Some author
            UpdatedAt = Some now
        }

    match effect with
    | AppendLog entry ->
        { state with
            AdoSyncLog = entry :: state.AdoSyncLog
        },
        diffs @ [ AdoSyncLogAppended entry ]
    | PatchTask(taskId, fields) ->
        if state.Tasks |> List.exists (fun task -> task.Id = taskId) then
            let stamped = stamp fields

            { state with
                Tasks =
                    state.Tasks
                    |> List.map (fun task -> if task.Id = taskId then mergeTask stamped task else task)
            },
            diffs @ [ TaskUpdated(taskId, stamped) ]
        else
            state, diffs
    | CreateTask task ->
        if state.Tasks |> List.exists (fun existing -> existing.Id = task.Id) then
            state, diffs
        else
            let stamped =
                { task with
                    UpdatedBy = Some author
                    UpdatedAt = Some now
                }

            { state with
                Tasks = state.Tasks @ [ stamped ]
            },
            diffs @ [ TaskAdded stamped ]
    | Emit diff -> state, diffs @ [ diff ]

/// Aplikuje efekty a vrátí nový stav s diffy k rozeslání.
///
/// `author` je jméno, které se u dotčených úkolů objeví jako „naposledy
/// změnil" — u ADO syncu je to ten, kdo sync spustil, protože změnu do
/// plánovače pustil on, ne Azure DevOps samo.
let applyEffects (state: AppState) (author: string) (now: string) (effects: AdoEffect list) =
    effects |> List.fold (applyEffect author now) (state, [])

/// Zadání pro ADO operaci. `State` je snímek stavu v okamžiku spuštění —
/// pracuje se s ním mimo mailbox, takže se během běhu nemění.
[<NoEquality; NoComparison>]
type AdoRequest =
    {
        ProjectId: string
        User: UserContext
        State: AppState
        Command: AdoCommand
        /// Průběžné hlášení iniciátorovi (FR-ADO-04); jde mimo mailbox.
        Report: ProjectDiff -> unit
    }

/// Hrubý název commandu pro chybový diff. Přesný wire tag zná modul Json,
/// ten se ale kompiluje až po tomhle souboru.
let commandTypeHint (command: AdoCommand) =
    match command with
    | AdoRunSync -> "ado_run_sync"
    | AdoTestConnection -> "ado_test_connection"
    | AdoSavePat _ -> "ado_save_pat"
    | AdoDeletePat -> "ado_delete_pat"
    | AdoSaveConfig _ -> "ado_save_config"
    | _ -> "ado"

/// Implementaci dodává `AdoBridge`; testy si podstrčí vlastní.
[<NoEquality; NoComparison>]
type AdoGateway =
    {
        Run: AdoRequest -> Async<AdoEffect list>
    }

    /// Server bez nakonfigurované ADO integrace — command se tiše odbyde chybou.
    static member Disabled =
        {
            Run =
                fun request ->
                    async {
                        return
                            [
                                Emit(
                                    ErrorOccurred(
                                        "ADO integrace není na tomto serveru dostupná",
                                        commandTypeHint request.Command
                                    )
                                )
                            ]
                    }
        }
