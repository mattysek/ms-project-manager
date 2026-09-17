/// Reducer doménových slices „ADO" a „session".
///
/// Commandy, které nemění stav projektu (uložení PAT, spuštění syncu,
/// presence), reducer jen propustí — postará se o ně actor. Reducer zůstává
/// čistý, žádné I/O.
module MSProjectManager.Domain.Reducers.Session

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs

module Weeks = MSProjectManager.Domain.Weeks

/// Aplikuje ADO command.
///
/// Reducer je čistá funkce, takže tu končí jen to, co se dá rozhodnout bez
/// I/O: uložení konfigurace do stavu a validace PATu. Všechno ostatní
/// (volání ADO API, šifrovaný PAT, snapshot, sync log) obstará `AdoBridge`
/// mimo mailbox a výsledek se do stavu vrátí jako `AdoEffect`.
let applyAdo (state: AppState) (command: AdoCommand) : Result<AppState * ProjectDiff list, string> =
    match command with
    | AdoSaveConfig config ->
        // Do stavu jde jen `config`; `patSet`/`patUpdatedAt` v diffu jsou
        // per-user (ADR-004, „Stav mimo AppState"), takže diff skládá bridge,
        // který se umí zeptat tabulky `ado_credentials`.
        Ok({ state with AdoConfig = Some config }, [])
    | AdoSavePat pat when System.String.IsNullOrWhiteSpace pat -> Error "PAT nesmí být prázdný"
    // PAT se nikdy neukládá do stavu projektu — jde šifrovaný do tabulky
    // `ado_credentials` (ADR-008); diff `ado_pat_saved` vystaví bridge.
    | AdoSavePat _
    | AdoDeletePat
    | AdoTestConnection
    | AdoRequestStatus
    | AdoRunSync
    | AdoAcknowledgeChange _
    | AdoIgnoreGap _
    | AdoIgnoreUnlinkedTask _
    | AdoAcceptFromAdo _
    | AdoPushAssignee _
    | AdoPushState _
    | AdoPushDescription _
    | AdoCreateWorkItem _
    | AdoAddGapToPlan _
    | AdoLinkGapToTask _ -> Ok(state, [])

/// Dorovná `WeekAlloc` na počet týdnů importovaného projektu.
///
/// Import je jediná cesta, která stav nahrazuje celý a ne po jednom poli,
/// takže je taky jediná, která umí uložit alokaci kratší, než kolik má
/// projekt týdnů (`update_project` si délku srovnává sám v `recalculate`).
/// Navenek to nevypadalo jako poškozená data: klient chybějící týdny dopadá
/// stovkami, takže se tabulka Kapacity vykreslila celá — ale zapsat do ní
/// nešlo. Klient mapuje přes uložené pole, nad prázdným seznamem tedy
/// nevznikne žádná změna a tím ani žádný command, takže procenta jen skákala
/// zpátky a na server neodešlo nic. Žádná chyba, žádné odmítnutí.
let private fitPeopleToTimeline (project: Project) (people: Person list) =
    let weekCount = Weeks.count project.StartDate project.EndDate

    people
    |> List.map (fun person ->
        { person with
            WeekAlloc = Weeks.fitAlloc weekCount person.WeekAlloc
        }
    )

/// Import nahrazuje stav projektu. Přílohy zůstávají ty současné — jejich
/// obsah je v DB a importovaný JSON by nesl jen metadata bez BLOBů (ADR-010).
/// TODO a připomínky z importu patří tomu, kdo import spustil; cizí soukromé
/// položky import nemaže.
let private import (state: AppState) (user: UserContext) (imported: ClientAppState) =
    let next =
        { state with
            Project = imported.Project
            People = fitPeopleToTimeline imported.Project imported.People
            Tasks = imported.Tasks
            Cats = imported.Cats
            Roles = imported.Roles
            Risks = imported.Risks
            Opps = imported.Opps
            KbPages = imported.KbPages
            AdoConfig = imported.AdoConfig
            AdoSyncLog = imported.AdoSyncLog
            TodosByUser = Map.add user.UserId imported.Todos state.TodosByUser
            RemindersByUser = Map.add user.UserId imported.Reminders state.RemindersByUser
        }

    Ok(next, [ FullState(forUser user.UserId next) ])

/// Aplikuje session command.
let applySession
    (state: AppState)
    (user: UserContext)
    (command: SessionCommand)
    : Result<AppState * ProjectDiff list, string> =
    match command with
    | FullStateImport imported -> import state user imported
    // Presence je efemérní, do stavu projektu nepatří (FR-COLLAB-04).
    | UpdatePresence _ -> Ok(state, [])
    | Undo
    | Redo -> Error "Undo a redo řeší podle ADR-007 klient — server očekává reverzní command, ne 'undo'"
