/// Spuštění synchronizace s ADO (FR-ADO-04, 05, 09).
///
/// Běží mimo mailbox actora: stáhne work items, porovná je se snapshotem
/// z posledního syncu, uloží nový snapshot a výsledek pošle jako jediný efekt.
/// Průběh hlásí iniciátorovi přes `request.Report` (FR-ADO-04).
module MSProjectManager.Integration.AdoBridgeSync

open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.AdoSync
open MSProjectManager.Domain.AdoChanges
open MSProjectManager.Domain.Diffs
open MSProjectManager.Domain.AdoGateway
open MSProjectManager.Integration.AdoApiClient
open MSProjectManager.Integration.AdoBridgeContext

/// PRD-06 omezuje jeden sync na 200 work items; dávkování po 100 řeší
/// `fetchWorkItems` samo.
[<Literal>]
let private MaxWorkItems = 200

/// Stáhne work items a průběžně hlásí postup iniciátorovi (FR-ADO-04).
let private fetchAll (deps: BridgeDependencies) (request: AdoRequest) credentials (ids: int list) =
    let wanted = ids |> List.truncate MaxWorkItems
    let total = wanted.Length

    let report loaded =
        request.Report(AdoSyncProgress("Stahuji work items", loaded, total))

    fetchWorkItemsWithChildren deps.Http credentials wanted report

/// Coverage gap — work items v ADO, na které v plánovači nic neodkazuje
/// (FR-ADO-09). Selhání dotazu sync neshodí; gap je doplňková informace.
let private fetchGaps (deps: BridgeDependencies) credentials (linkedIds: int list) =
    async {
        try
            let! candidates = fetchCoverageGapWorkItems deps.Http credentials
            return findUncoveredWorkItems candidates linkedIds |> List.map toView
        with _ ->
            return []
    }

/// Sestaví vstup pro detekci změn ze stavu projektu a stažených work items.
let private changeInput (request: AdoRequest) snapshot workItems mappings =
    {
        Snapshot = snapshot
        WorkItems = workItems
        Mappings = mappings
        Tasks = request.State.Tasks
        MemberMapping =
            request.State.AdoConfig
            |> Option.map (fun config -> config.MemberMapping)
            |> Option.defaultValue []
        People = request.State.People
    }

/// Odfiltruje změny, které už uživatel jednou odklikl (FR-ADO-06).
let private withoutAcknowledged (snapshot: AdoSnapshot option) (changes: WiChange list) =
    match snapshot with
    | None -> changes
    | Some value ->
        let seen = Set.ofList value.AcknowledgedChanges

        changes
        |> List.filter (fun change -> not (seen.Contains(changeKey change.WiId change.Type change.NewValue)))

let private runSync (deps: BridgeDependencies) (request: AdoRequest) credentials =
    async {
        let mappings = extractLinkedWiIds request.State.Tasks
        let linkedIds = allLinkedWiIds request.State.Tasks

        request.Report(AdoSyncProgress("Stahuji work items", 0, linkedIds.Length))
        let! workItems = fetchAll deps request credentials linkedIds

        request.Report(AdoSyncProgress("Porovnávám změny", 0, 0))
        let! snapshot = tryLoadSnapshot deps request.ProjectId

        let changes =
            changeInput request snapshot workItems mappings
            |> detectChanges
            |> withoutAcknowledged snapshot

        let! gaps = fetchGaps deps credentials linkedIds

        let timestamp = nowIso ()
        let next = buildSnapshot snapshot timestamp linkedIds workItems
        do! saveSnapshot deps request.ProjectId next

        // Do view jdou jen navázané WI; child Bugy se stahují kvůli detekci,
        // ne proto, aby se objevily v seznamu.
        let requested = Set.ofList linkedIds

        let context =
            {
                WorkItems = workItems |> List.filter (fun wi -> requested.Contains wi.Id) |> List.map toView
                LastSync = timestamp
                Decisions = decisionsOf next
            }

        // Samotný sync je čtení — do logu nic nepřidává. `AdoSyncAction` má
        // jen uživatelské akce (FR-ADO-10) a vymýšlet pro běh syncu novou by
        // znamenalo rozejít se s tvarem, který zná klient. Diff proto veze
        // dosavadní log, aby si ho view mohlo vykreslit bez dalšího dotazu.
        return [ Emit(AdoSyncCompleted(changes, gaps, request.State.AdoSyncLog, context)) ]
    }

/// Spustí sync; chybu z ADO přeloží na chybový diff místo pádu actora.
let run (deps: BridgeDependencies) (request: AdoRequest) =
    async {
        let! credentials = tryCredentials deps request

        match credentials with
        | Error message -> return [ Emit(ErrorOccurred(message, "ado_run_sync")) ]
        | Ok value ->
            try
                return! runSync deps request value
            with error ->
                return [ errorEffect request.Command error ]
    }
