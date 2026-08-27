/// Detekce změn mezi ADO a plánovačem (FR-ADO-05, FR-ADO-07).
///
/// Jádro hodnoty celé integrace: porovnává tři věci — aktuální work items
/// z ADO, uložený snapshot a stav úkolů v plánovači. Pořadí kontrol i texty
/// hlášek jsou převzaté z `detectChanges` v `src/utils/adoSync.ts`; změna
/// sémantiky by tiše změnila to, co uživatel v UI vidí.
module MSProjectManager.Domain.AdoChanges

open System
open System.Text.RegularExpressions
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.AdoMarkdown
open MSProjectManager.Domain.AdoSync

/// Vstup detekce pohromadě — funkcí je hodně a limit ADR-012 jsou čtyři
/// parametry.
[<NoEquality; NoComparison>]
type ChangeInput =
    {
        Snapshot: AdoSnapshot option
        WorkItems: AdoWorkItem list
        Mappings: TaskWiMapping list
        Tasks: Task list
        MemberMapping: AdoMemberMapping list
        People: Person list
    }

/// Work item a úkol, kterého se změna týká.
type private Target =
    {
        WiId: int
        WiTitle: string
        TaskId: string
        TaskName: string
    }

let private make (target: Target) (changeType: WiChangeType) (details: string) =
    {
        Type = changeType
        Severity = severityOf changeType
        Direction = None
        WiId = target.WiId
        WiTitle = target.WiTitle
        TaskId = target.TaskId
        TaskName = target.TaskName
        Details = details
        OldValue = null
        NewValue = null
    }

/// JS `Math.round` zaokrouhluje půlky nahoru, .NET `Math.Round` na sudou —
/// procenta by se lišila o jedničku.
let private roundJs (value: float) = floor (value + 0.5)

let private text (value: string | null) (fallback: string) =
    match value with
    | null -> fallback
    | actual -> actual

// ── Kontroly proti snapshotu ────────────────────────────────────────────────

let private stateChanges (target: Target) (previous: AdoSnapshotItem) (state: string) =
    [
        if isResolvedState previous.State && isActiveState state then
            { make target StateRegression $"Stav se vrátil z \"{previous.State}\" na \"{state}\"" with
                OldValue = previous.State
                NewValue = state
            }

        if isActiveState previous.State && isResolvedState state then
            { make target StateResolved $"Dokončeno: \"{previous.State}\" → \"{state}\"" with
                OldValue = previous.State
                NewValue = state
            }
    ]

/// Text hlášky o změně Remaining Work. Skládá se konkatenací, protože znak
/// procenta uvnitř interpolovaného řetězce v F# koliduje s formátovacími
/// specifikátory.
let private remainingDetails (before: float) (now: float) (percent: string) =
    "Remaining work: "
    + string before
    + "h → "
    + string now
    + "h ("
    + percent
    + "%)"

/// Změna Remaining Work se hlásí až od 20 %, jinak by sync šuměl.
///
/// Nula jako výchozí hodnota je zvláštní případ: procentní změna proti nule
/// je nekonečno a v UI se to dřív ukazovalo doslova („+Infinity%"). Přechod
/// z nuly proto hlásíme jako nový odhad, ne jako procenta.
let private remainingChanges (target: Target) (previous: AdoSnapshotItem) (remaining: float option) =
    match previous.RemainingWork, remaining with
    | Some before, Some now ->
        let built changeType label =
            [
                { make target changeType (remainingDetails before now label) with
                    OldValue = string before
                    NewValue = string now
                }
            ]

        if before = 0.0 then
            if now > 0.0 then
                built RemainingIncrease "nově odhadnuto"
            else
                []
        else
            let percent = (now - before) / before * 100.0
            let rounded = string (roundJs percent)

            if percent > 20.0 then
                built RemainingIncrease ("+" + rounded)
            elif percent < -20.0 then
                built RemainingDecrease rounded
            else
                []
    | _ -> []

let private assigneeChanges (target: Target) (previous: AdoSnapshotItem) (assignee: string | null) =
    if previous.AssignedTo <> assignee then
        // Literál uvnitř interpolace by v běžném řetězci byl FS3373 — proto `let`.
        let before = text previous.AssignedTo "nikdo"
        let after = text assignee "nikdo"

        [
            { make target AssigneeChange $"Přiřazení: \"{before}\" → \"{after}\"" with
                OldValue = previous.AssignedTo
                NewValue = assignee
            }
        ]
    else
        []

/// Popis se porovnává proti **aktuálnímu** popisu úkolu, ne proti snapshotu —
/// rozdíl je zajímavý i tehdy, když se v ADO nic nezměnilo.
let private descriptionChanges (target: Target) (task: Task option) (descriptionMd: string) =
    match task with
    | Some value when not (areDescriptionsEqual value.Desc descriptionMd) ->
        [
            { make target DescriptionChange "Popis se liší mezi plánovačem a ADO" with
                OldValue = descriptionHash value.Desc
                NewValue = descriptionHash descriptionMd
            }
        ]
    | _ -> []

// ── Průchod work items ──────────────────────────────────────────────────────

let private targetOf (mapping: TaskWiMapping) (wi: AdoWorkItem) =
    {
        WiId = wi.Id
        WiTitle = wi.Fields.Title
        TaskId = mapping.TaskId
        TaskName = mapping.TaskName
    }

/// Work item → **všechny** úkoly, které na něj odkazují.
///
/// Dřív to byla `Map<int, TaskWiMapping>` postavená přes `Map.ofList`, takže
/// když na stejný WI odkazovaly dva úkoly, jeden z nich tiše vypadl z detekce
/// a záleželo na pořadí úkolů. Teď dostane změnu každý z nich.
let private wiToTasks (mappings: TaskWiMapping list) =
    mappings
    |> List.collect (fun mapping -> mapping.WiIds |> List.map (fun wiId -> wiId, mapping))
    |> List.groupBy fst
    |> List.map (fun (wiId, pairs) -> wiId, pairs |> List.map snd)
    |> Map.ofList

let private adoToPlannerFor (input: ChangeInput) (wi: AdoWorkItem) (mapping: TaskWiMapping) =
    let target = targetOf mapping wi
    let task = input.Tasks |> List.tryFind (fun item -> item.Id = mapping.TaskId)
    let descriptionMd = descriptionOf wi

    let fromSnapshot =
        match
            input.Snapshot
            |> Option.bind (fun snapshot -> Map.tryFind (string wi.Id) snapshot.Items)
        with
        | None -> []
        | Some previous ->
            stateChanges target previous wi.Fields.State
            @ remainingChanges target previous wi.Fields.RemainingWork
            @ assigneeChanges target previous (toView wi).AssignedTo

    fromSnapshot @ descriptionChanges target task descriptionMd

let private adoToPlanner (input: ChangeInput) (lookup: Map<int, TaskWiMapping list>) (wi: AdoWorkItem) =
    Map.tryFind wi.Id lookup
    |> Option.defaultValue []
    |> List.collect (adoToPlannerFor input wi)

/// Nový child Bug pod sledovaným work itemem. Poznáme ho podle toho, že
/// v předchozím snapshotu ještě nebyl — bez snapshotu by byl „nový" každý.
let private newBugChildren (input: ChangeInput) (lookup: Map<int, TaskWiMapping list>) =
    match input.Snapshot with
    | None -> []
    | Some snapshot ->
        input.WorkItems
        |> List.filter (fun wi -> wi.Fields.WorkItemType = "Bug")
        |> List.filter (fun wi -> not (snapshot.Items.ContainsKey(string wi.Id)))
        |> List.choose (fun wi ->
            let parent =
                wi.Relations
                |> Option.defaultValue []
                |> List.tryFind (fun relation -> relation.Rel = "System.LinkTypes.Hierarchy-Reverse")
                |> Option.map (fun relation -> Regex.Match(relation.Url, "/(\\d+)$"))
                |> Option.filter (fun m -> m.Success)
                |> Option.bind (fun m -> Map.tryFind (int m.Groups.[1].Value) lookup)
                |> Option.bind List.tryHead

            parent
            |> Option.map (fun mapping ->
                make (targetOf mapping wi) NewBugChild $"Nový Bug: #{wi.Id} \"{wi.Fields.Title}\""
            )
        )

// ── Směr plánovač → ADO ─────────────────────────────────────────────────────

let private assignmentDiffers (input: ChangeInput) (target: Target) (task: Task) (wi: AdoWorkItem) =
    let person = input.People |> List.tryFind (fun item -> item.Id = task.P)
    let mapped = findAdoIdentityByPerson task.P input.MemberMapping

    match person, mapped with
    | Some owner, Some identity ->
        let differs (assigned: AdoIdentity) =
            let adoIdentity =
                [ assigned.UniqueName; assigned.DisplayName ]
                |> List.tryFind (fun value -> not (String.IsNullOrEmpty value))

            match adoIdentity with
            | Some value when not (String.Equals(identity, value, StringComparison.OrdinalIgnoreCase)) ->
                Some assigned.DisplayName
            | _ -> None

        match wi.Fields.AssignedTo with
        | None ->
            [
                { make target PlannerAssignmentDiffers $"V plánovači: {owner.Name} | V ADO: (nepřiřazeno)" with
                    Direction = Some PlannerToAdo
                    OldValue = owner.Name
                }
            ]
        | Some assigned ->
            differs assigned
            |> Option.map (fun displayName ->
                { make target PlannerAssignmentDiffers $"V plánovači: {owner.Name} | V ADO: {displayName}" with
                    Direction = Some PlannerToAdo
                    OldValue = owner.Name
                    NewValue = displayName
                }
            )
            |> Option.toList
    | _ -> []

/// Viz `remainingDetails` — procento se do interpolovaného řetězce nedává.
let private completedDetails (state: string) =
    "Úkol je na 100%, ale WI je stále \"" + state + "\""

let private plannerToAdoFor (input: ChangeInput) (wi: AdoWorkItem) (mapping: TaskWiMapping) =
    match input.Tasks |> List.tryFind (fun item -> item.Id = mapping.TaskId) with
    | None -> []
    | Some task ->
        let target = targetOf mapping wi

        let assignment =
            if String.IsNullOrEmpty task.P || List.isEmpty input.MemberMapping then
                []
            else
                assignmentDiffers input target task wi

        let completion =
            if task.Progress = 100 && not (isResolvedState wi.Fields.State) then
                [
                    { make target PlannerCompletedNotAdo (completedDetails wi.Fields.State) with
                        Direction = Some PlannerToAdo
                        OldValue = "100"
                        NewValue = wi.Fields.State
                    }
                ]
            else
                []

        assignment @ completion

let private plannerToAdo (input: ChangeInput) (lookup: Map<int, TaskWiMapping list>) (wi: AdoWorkItem) =
    Map.tryFind wi.Id lookup
    |> Option.defaultValue []
    |> List.collect (plannerToAdoFor input wi)

/// Všechny změny seřazené podle závažnosti. Řazení je stabilní, takže
/// v rámci závažnosti zůstává pořadí detekce.
let detectChanges (input: ChangeInput) : WiChange list =
    let lookup = wiToTasks input.Mappings

    let changes =
        (input.WorkItems |> List.collect (adoToPlanner input lookup))
        @ newBugChildren input lookup
        @ (input.WorkItems |> List.collect (plannerToAdo input lookup))

    changes |> List.sortBy (fun change -> severityRank change.Severity)
