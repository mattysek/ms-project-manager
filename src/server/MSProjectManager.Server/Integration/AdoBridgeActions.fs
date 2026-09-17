/// Akce nad výsledkem synchronizace (FR-ADO-06 až 09).
///
/// Dva druhy: „přebrat z ADO" mění stav plánovače (efekt `PatchTask`),
/// „poslat do ADO" volá REST API a stav mění jen výjimečně. Obojí zapisuje
/// do sync logu (FR-ADO-10).
///
/// Hodnoty z ADO se pro jistotu **stahují znovu** v okamžiku akce, ne berou
/// z výsledku syncu — mezi syncem a kliknutím mohl work item někdo změnit.
module MSProjectManager.Integration.AdoBridgeActions

open System
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Domain.AdoMarkdown
open MSProjectManager.Domain.AdoSync
open MSProjectManager.Domain.AdoGateway
open MSProjectManager.Integration.AdoApiClient
open MSProjectManager.Integration.AdoBridgeContext

let private newLinkId () = Guid.NewGuid().ToString "N"

/// Chybí-li úkol, na který se akce odkazuje, nemá smysl volat ADO.
let private requireTask (state: AppState) (taskId: string) =
    match state.Tasks |> List.tryFind (fun task -> task.Id = taskId) with
    | Some task -> Ok task
    | None -> Error "Úkol už neexistuje"

let private memberMappingOf (state: AppState) =
    state.AdoConfig
    |> Option.map (fun config -> config.MemberMapping)
    |> Option.defaultValue []

/// Odkaz na work item přidaný na úkol.
let private wiLink (config: AdoConfig) (wiId: int) =
    {
        Id = newLinkId ()
        Label = $"WI #{wiId}"
        Url = buildWiUrl config wiId
    }

let private patch (taskId: string) (fields: TaskFields) = PatchTask(taskId, fields)

// ── ADO → plánovač (FR-ADO-06) ──────────────────────────────────────────────

/// Znak procenta se v interpolovaném řetězci pere s formátovacími
/// specifikátory — proto konkatenace.
let private progressDetails (progress: int) =
    "progress aktualizován na " + string progress + " %"

/// Stav work itemu se do plánovače promítá jako progress úkolu.
let private acceptState (task: Task) (wi: AdoWorkItemView) =
    match mapAdoStateToProgress wi.State with
    | None ->
        [
            Emit(ErrorOccurred($"Stav „{wi.State}“ neumím převést na progress", "ado_accept_from_ado"))
        ]
    | Some progress ->
        [
            patch
                task.Id
                { emptyTaskFields with
                    Progress = Some progress
                }
            // `DESC_SYNC_FROM_ADO` je vyhrazené pro popis. Převzetí stavu je
            // podle `ado-sync.feature` v logu `ACKNOWLEDGED`.
            AppendLog(logFor Acknowledged (Some task) (wi.Id, wi.Title) (progressDetails progress))
        ]

/// Přiřazení se přebírá přes mapování ADO identity na osobu v plánovači.
let private acceptAssignee (state: AppState) (task: Task) (wi: AdoWorkItemView) =
    match findPersonByAdoIdentity wi.AssignedToEmail (memberMappingOf state) state.People with
    | None ->
        [
            Emit(ErrorOccurred("Osoba z ADO není namapovaná na nikoho v plánovači", "ado_accept_from_ado"))
        ]
    | Some person ->
        [
            patch
                task.Id
                { emptyTaskFields with
                    P = Some person.Id
                }
            AppendLog(logFor Acknowledged (Some task) (wi.Id, wi.Title) $"přiřazeno {person.Name} podle ADO")
        ]

/// `text` nese sloučený popis při obousměrném merge; `None` = vezmi ADO popis.
let private acceptDescription (task: Task) (wi: AdoWorkItemView) (text: string option) =
    let description = text |> Option.defaultValue wi.DescriptionMd

    [
        patch
            task.Id
            { emptyTaskFields with
                Desc = Some description
            }
        AppendLog(logFor DescSyncFromAdo (Some task) (wi.Id, wi.Title) "Převzat popis z ADO")
    ]

let private applyAccept (state: AppState) (task: Task) (wi: AdoWorkItemView, field: AdoAcceptField, text) =
    match field with
    | AcceptState -> acceptState task wi
    | AcceptAssignee -> acceptAssignee state task wi
    | AcceptDescription -> acceptDescription task wi text

// ── Plánovač → ADO (FR-ADO-07, 08) ──────────────────────────────────────────

let private pushed (task: Task) (wi: int * string) (details: string) =
    AppendLog(logFor PushedToAdo (Some task) wi details)

/// Coverage gap → nový úkol v plánovači (FR-ADO-09).
let addGapToPlan (wiId: int) (task: Task) =
    [
        CreateTask task
        AppendLog(logFor AddedToPlan (Some task) (wiId, task.Name) "Work item přidán do plánu")
    ]

/// Coverage gap → odkaz na existující úkol.
let linkGapToTask (state: AppState) (config: AdoConfig) (wiId: int) (taskId: string) =
    match requireTask state taskId with
    | Error message -> [ Emit(ErrorOccurred(message, "ado_link_gap_to_task")) ]
    | Ok task ->
        [
            patch
                task.Id
                { emptyTaskFields with
                    Links = Some(task.Links @ [ wiLink config wiId ])
                }
            AppendLog(logFor Linked (Some task) (wiId, task.Name) $"Úkol propojen s work itemem #{wiId}")
        ]

// ── Operace volající ADO ────────────────────────────────────────────────────

/// Stáhne jeden work item; prázdná odpověď znamená, že v ADO už není.
let private fetchOne deps credentials (wiId: int) =
    async {
        let! items = fetchWorkItems deps.Http credentials [ wiId ] ignore

        return
            match items with
            | [] -> Error $"Work item #{wiId} se v ADO nepodařilo najít"
            | first :: _ -> Ok(toView first)
    }

/// Srovná baseline snapshotu s tím, co jsme právě do ADO zapsali (FR-ADO-05).
///
/// Work item se kvůli tomu stahuje **znovu**: víme, co jsme poslali, ne co
/// z toho ADO udělalo — přiřazení se posílá jako e-mail a ve snapshotu je
/// zobrazované jméno. Selhání dotazu akci neshodí, jen nechá baseline starou;
/// push do ADO už proběhl a chyba tady by tvrdila opak.
let private rebaseline deps credentials (projectId: string) (wiId: int) =
    async {
        try
            let! wi = fetchOne deps credentials wiId

            match wi with
            | Ok view -> do! refreshSnapshotItem deps projectId view
            | Error _ -> ()
        with _ ->
            ()
    }

/// Přebrání hodnoty z ADO (FR-ADO-06).
let acceptFromAdo deps credentials (state: AppState) (command: int * string * AdoAcceptField * string option) =
    async {
        let wiId, taskId, field, text = command

        match requireTask state taskId with
        | Error message -> return [ Emit(ErrorOccurred(message, "ado_accept_from_ado")) ]
        | Ok task ->
            let! wi = fetchOne deps credentials wiId

            return
                match wi with
                | Error message -> [ Emit(ErrorOccurred(message, "ado_accept_from_ado")) ]
                | Ok view -> applyAccept state task (view, field, text)
    }

/// Přepíše přiřazení work itemu podle plánovače (FR-ADO-07).
let pushAssignee deps credentials (state: AppState) (projectId: string, wiId: int, taskId: string) =
    async {
        match requireTask state taskId with
        | Error message -> return [ Emit(ErrorOccurred(message, "ado_push_assignee")) ]
        | Ok task ->
            match findAdoIdentityByPerson task.P (memberMappingOf state) with
            | None ->
                return
                    [
                        Emit(ErrorOccurred("Osoba úkolu nemá namapovanou ADO identitu", "ado_push_assignee"))
                    ]
            | Some identity ->
                do! updateWorkItemField deps.Http credentials wiId ("System.AssignedTo", identity)
                do! rebaseline deps credentials projectId wiId
                return [ pushed task (wiId, task.Name) $"Přiřazení posláno do ADO: {identity}" ]
    }

/// Přepíše stav work itemu (FR-ADO-07).
let pushState deps credentials (state: AppState) (projectId: string, wiId: int, taskId: string, target: string) =
    async {
        match requireTask state taskId with
        | Error message -> return [ Emit(ErrorOccurred(message, "ado_push_state")) ]
        | Ok task ->
            do! updateWorkItemField deps.Http credentials wiId ("System.State", target)
            do! rebaseline deps credentials projectId wiId
            return [ pushed task (wiId, task.Name) $"Stav v ADO změněn na {target}" ]
    }

/// Přepíše popis work itemu; při obousměrném merge uloží text i na úkol.
let pushDescription
    deps
    credentials
    (state: AppState)
    (projectId: string, wiId: int, taskId: string, text: string, alsoPlanner: bool)
    =
    async {
        match requireTask state taskId with
        | Error message -> return [ Emit(ErrorOccurred(message, "ado_push_description")) ]
        | Ok task ->
            do! updateWorkItemField deps.Http credentials wiId ("System.Description", markdownToHtml text)
            do! rebaseline deps credentials projectId wiId

            let action = if alsoPlanner then DescSyncBoth else DescSyncToAdo

            let plannerSide =
                if alsoPlanner then
                    [
                        patch
                            task.Id
                            { emptyTaskFields with
                                Desc = Some text
                            }
                    ]
                else
                    []

            return
                plannerSide
                @ [
                    AppendLog(logFor action (Some task) (wiId, task.Name) "Popis synchronizován")
                ]
    }

/// Založí work item z úkolu a přilepí na úkol odkaz (FR-ADO-08).
let createWorkItemFor deps credentials (state: AppState) (config: AdoConfig, taskId: string, draft: AdoWorkItemDraft) =
    async {
        match requireTask state taskId with
        | Error message -> return [ Emit(ErrorOccurred(message, "ado_create_work_item")) ]
        | Ok task ->
            let! wiId = createWorkItem deps.Http credentials draft

            return
                [
                    patch
                        task.Id
                        { emptyTaskFields with
                            Links = Some(task.Links @ [ wiLink config wiId ])
                        }
                    pushed task (wiId, draft.Title) $"Založen work item #{wiId} v ADO"
                ]
    }
