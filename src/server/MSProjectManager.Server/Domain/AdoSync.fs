/// Čistá logika ADO synchronizace — port `src/utils/adoSync.ts` (ADR-008).
///
/// Nic tu nevolá síť ani databázi: vstupem jsou work items z ADO, uložený
/// snapshot a stav plánovače, výstupem snapshot, seznamy a odvozené hodnoty.
/// Detekce změn samotná je v `AdoChanges` (rozpočet na délku modulu).
module MSProjectManager.Domain.AdoSync

open System
open System.Text.RegularExpressions
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.AdoMarkdown

// ── URL work itemů ──────────────────────────────────────────────────────────

/// Tvary odkazů na work item: dev.azure.com, starší visualstudio.com a
/// on-premise TFS. Pořadí odpovídá klientskému `ADO_URL_PATTERNS`.
let private urlPatterns =
    [
        "https://dev\\.azure\\.com/[^/]+/[^/]+/_workitems/edit/(\\d+)"
        "https://[^.]+\\.visualstudio\\.com/[^/]+/_workitems/edit/(\\d+)"
        "https?://[^/]+/[^/]+/[^/]+/_workitems/edit/(\\d+)"
    ]

/// Id work itemu z odkazu, `None` pokud to není ADO odkaz.
let tryExtractWiId (url: string | null) : int option =
    match url with
    | null -> None
    | value ->
        urlPatterns
        |> List.tryPick (fun pattern ->
            let m = Regex.Match(value, pattern)

            if m.Success then Some(int m.Groups.[1].Value) else None
        )

/// Odkazuje URL na work item? Platí pro všechny varianty ADO i TFS.
let isAdoUrl (url: string | null) =
    match url with
    | null -> false
    | value -> value.Contains "/_workitems/edit/"

/// Odkaz na work item pro daný projekt.
let buildWiUrl (config: AdoConfig) (wiId: int) =
    $"{config.OrgUrl}/{Uri.EscapeDataString config.Project}/_workitems/edit/{wiId}"

// ── Vazba úkolů na work items ───────────────────────────────────────────────

/// Úkol a work items, na které odkazuje.
type TaskWiMapping =
    {
        TaskId: string
        TaskName: string
        WiIds: int list
    }

/// Úkoly, které mají alespoň jeden ADO odkaz.
let extractLinkedWiIds (tasks: Task list) : TaskWiMapping list =
    tasks
    |> List.choose (fun task ->
        let ids =
            task.Links
            |> List.filter (fun link -> isAdoUrl link.Url)
            |> List.choose (fun link -> tryExtractWiId link.Url)

        if List.isEmpty ids then
            None
        else
            Some
                {
                    TaskId = task.Id
                    TaskName = task.Name
                    WiIds = ids
                }
    )

/// Všechna navázaná id work itemů bez duplicit.
let allLinkedWiIds (tasks: Task list) : int list =
    extractLinkedWiIds tasks
    |> List.collect (fun mapping -> mapping.WiIds)
    |> List.distinct

/// Úkoly bez ADO vazby (FR-ADO-08). Úkol bez osoby se počítá taky — work item
/// bez přiřazení je v ADO legální; zrcadlí `tasksWithoutAdoLink` na klientovi,
/// který tenhle seznam vykresluje.
let findTasksWithoutAdoLink (tasks: Task list) : Task list =
    tasks
    |> List.filter (fun task -> not (task.Links |> List.exists (fun link -> isAdoUrl link.Url)))

/// Work items v ADO, na které neodkazuje žádný úkol (Coverage gap, FR-ADO-09).
let findUncoveredWorkItems (workItems: AdoWorkItem list) (linkedWiIds: int list) =
    let linked = Set.ofList linkedWiIds
    workItems |> List.filter (fun wi -> not (linked.Contains wi.Id))

// ── Snapshot ────────────────────────────────────────────────────────────────

let private assignedDisplayName (wi: AdoWorkItem) : string | null =
    match wi.Fields.AssignedTo with
    | Some identity -> identity.DisplayName
    | None -> null

/// Markdown popis work itemu — jediné místo, kde se HTML z ADO převádí.
let descriptionOf (wi: AdoWorkItem) =
    htmlToMarkdown (Option.toObj wi.Fields.Description)

/// Work item ve tvaru pro klienta.
let toView (wi: AdoWorkItem) : AdoWorkItemView =
    {
        Id = wi.Id
        Title = wi.Fields.Title
        State = wi.Fields.State
        WorkItemType = wi.Fields.WorkItemType
        AssignedTo = assignedDisplayName wi
        AssignedToEmail =
            match wi.Fields.AssignedTo with
            | Some identity -> identity.UniqueName
            | None -> null
        AreaPath = defaultArg wi.Fields.AreaPath ""
        IterationPath = defaultArg wi.Fields.IterationPath ""
        RemainingWork = wi.Fields.RemainingWork
        DescriptionMd = descriptionOf wi
    }

/// Položka baseline z work itemu tak, jak ho vidí klient.
///
/// Stejný tvar, jaký skládá `buildSnapshot` — používá se po zápisu do ADO,
/// aby baseline odpovídala tomu, co jsme tam právě poslali.
let snapshotItemOfView (view: AdoWorkItemView) : AdoSnapshotItem =
    {
        State = view.State
        RemainingWork = view.RemainingWork
        AssignedTo = view.AssignedTo
        DescriptionHash = descriptionHash view.DescriptionMd
        WorkItemType = view.WorkItemType
        Title = view.Title
    }

/// Nový baseline z aktuálních work itemů. Uživatelská rozhodnutí se přebírají
/// z předchozího snapshotu — jsou to odklikané volby, ne odvozená data.
///
/// `requestedIds` jsou work items, na které jsme se ADO **ptali**. Položky
/// mimo tento okruh se z předchozího snapshotu **přenášejí**: WI, který se
/// dočasně odlinkoval nebo se nevešel do limitu jednoho syncu, by jinak přišel
/// o historii a po návratu by se tvářil jako nový — tedy bez detekce regrese.
/// Naopak WI, na který jsme se ptali a ADO ho nevrátil, byl smazán a z
/// baseline vypadne.
let buildSnapshot
    (previous: AdoSnapshot option)
    (timestamp: string)
    (requestedIds: int list)
    (workItems: AdoWorkItem list)
    : AdoSnapshot =
    // Přes `toView` schválně: baseline se po zápisu do ADO přepisuje
    // `snapshotItemOfView` a obě cesty musí dát tutéž hodnotu, jinak by sync
    // hlásil rozdíl proti tomu, co sám uložil.
    let fetched =
        workItems
        |> List.map (fun wi -> string wi.Id, snapshotItemOfView (toView wi))
        |> Map.ofList

    let carried = previous |> Option.defaultValue AdoSnapshot.Empty
    let requested = requestedIds |> List.map string |> Set.ofList

    let items =
        carried.Items
        |> Map.filter (fun key _ -> not (requested.Contains key))
        |> Map.fold (fun acc key value -> Map.add key value acc) fetched

    {
        LastSync = timestamp
        Items = items
        IgnoredGapIds = carried.IgnoredGapIds
        AcknowledgedChanges = carried.AcknowledgedChanges
        IgnoredUnlinkedTaskIds = carried.IgnoredUnlinkedTaskIds
    }

/// Rozhodnutí ze snapshotu ve tvaru pro klienta.
let decisionsOf (snapshot: AdoSnapshot) : AdoDecisions =
    {
        IgnoredGapIds = snapshot.IgnoredGapIds
        AcknowledgedChanges = snapshot.AcknowledgedChanges
        IgnoredUnlinkedTaskIds = snapshot.IgnoredUnlinkedTaskIds
    }

/// Přepne položku v seznamu rozhodnutí (potvrdit / znovu otevřít).
let toggle (value: 'T) (active: bool) (values: 'T list) =
    if active then
        if List.contains value values then
            values
        else
            value :: values
    else
        values |> List.filter (fun item -> item <> value)

// ── Stavy work itemů ────────────────────────────────────────────────────────

/// Stavy, které v ADO znamenají „pracuje se".
let activeStates = [ "Active"; "New"; "In Progress"; "Committed" ]

/// Stavy, které v ADO znamenají „hotovo".
let resolvedStates = [ "Resolved"; "Closed"; "Done"; "Completed" ]

let isActiveState (state: string) = List.contains state activeStates

let isResolvedState (state: string) = List.contains state resolvedStates

/// Stav v ADO na progress úkolu. `None` znamená „nemapuje se přímo, ať
/// rozhodne uživatel".
let mapAdoStateToProgress (state: string | null) : int option =
    match state with
    | null -> None
    | value ->
        let normalized = value.ToLowerInvariant()

        if [ "resolved"; "closed"; "done"; "completed" ] |> List.exists normalized.Contains then
            Some 100
        elif normalized = "new" then
            Some 0
        else
            None

/// Stav, do kterého se work item daného typu uzavírá. ADO procesy se liší,
/// tohle je návrh, ne dogma — uživatel ho může přepsat.
let resolvedStateForWiType (wiType: string | null) =
    match wiType with
    | null -> "Closed"
    | value ->
        match value.ToLowerInvariant() with
        | "bug" -> "Resolved"
        | "product backlog item"
        | "user story" -> "Done"
        | _ -> "Closed"

// ── Mapování osob ───────────────────────────────────────────────────────────

let private matches (identity: string) (mapping: AdoMemberMapping) =
    let normalized = identity.ToLowerInvariant()

    let candidates =
        [ mapping.AdoIdentity; mapping.AdoDisplayName ]
        |> List.choose Option.ofObj
        |> List.map (fun value -> value.ToLowerInvariant())

    List.contains normalized candidates

/// Osoba v plánovači podle ADO identity (e-mail nebo zobrazované jméno).
let findPersonByAdoIdentity (identity: string | null) (mapping: AdoMemberMapping list) (people: Person list) =
    match identity with
    | null -> None
    | value ->
        mapping
        |> List.filter (matches value)
        |> List.tryPick (fun entry -> people |> List.tryFind (fun person -> person.Id = entry.PlannerId))

/// ADO identita namapovaná na osobu v plánovači.
let findAdoIdentityByPerson (personId: string) (mapping: AdoMemberMapping list) =
    mapping
    |> List.tryFind (fun entry -> entry.PlannerId = personId)
    |> Option.bind (fun entry -> Option.ofObj entry.AdoIdentity)

// ── MD ↔ hodiny ─────────────────────────────────────────────────────────────

/// Koeficient z konfigurace; nula nebo záporná hodnota by dělila nulou.
let coefficientOf (config: AdoConfig) =
    if config.MdToHoursCoefficient > 0.0 then
        config.MdToHoursCoefficient
    else
        8.0

let mdToHours (md: float) (coefficient: float) = md * coefficient

let hoursToMd (hours: float) (coefficient: float) = hours / coefficient
