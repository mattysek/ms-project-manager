/// Typy Azure DevOps integrace — zrcadlí ADO sekci `src/types/index.ts`.
///
/// PAT tady záměrně není: ukládá se šifrovaný v tabulce `ado_credentials`
/// a nikdy neopouští server (ADR-008).
module MSProjectManager.Domain.Ado

open System.Text.Json.Serialization

// ── Konfigurace ─────────────────────────────────────────────────────────────

/// Mapování osoby v plánovači na identitu v ADO.
type AdoMemberMapping =
    {
        PlannerId: string
        AdoIdentity: string | null
        AdoDisplayName: string | null
    }

/// Konfigurace připojení k ADO (per projekt, spravuje ji PM).
type AdoConfig =
    {
        OrgUrl: string
        Project: string
        AreaPath: string
        TrackedWiTypes: string list
        DefaultPushWiType: string
        DefaultIteration: string
        MdToHoursCoefficient: float
        IncludePATInExport: bool
        MemberMapping: AdoMemberMapping list
    }

// ── Work items z ADO REST API ───────────────────────────────────────────────

/// Identita v ADO (`System.AssignedTo`). `UniqueName` je e-mail nebo
/// `DOMENA\jmeno`, podle toho, jak je organizace napojená.
type AdoIdentity =
    {
        DisplayName: string
        UniqueName: string
    }

/// Pole work itemu tak, jak je vrací ADO. Klíče jsou doslovné názvy polí
/// v ADO (s tečkami), proto `JsonPropertyName` — camelCase politika by je
/// rozbila.
type AdoWorkItemFields =
    {
        [<JsonPropertyName "System.Title">]
        Title: string
        [<JsonPropertyName "System.State">]
        State: string
        [<JsonPropertyName "System.WorkItemType">]
        WorkItemType: string
        [<JsonPropertyName "System.AssignedTo">]
        AssignedTo: AdoIdentity option
        [<JsonPropertyName "System.Description">]
        Description: string option
        [<JsonPropertyName "System.AreaPath">]
        AreaPath: string option
        [<JsonPropertyName "System.IterationPath">]
        IterationPath: string option
        [<JsonPropertyName "Microsoft.VSTS.Scheduling.RemainingWork">]
        RemainingWork: float option
        [<JsonPropertyName "System.ChangedDate">]
        ChangedDate: string option
    }

/// Vazba mezi work itemy; zajímá nás `System.LinkTypes.Hierarchy-Reverse`
/// (rodič), podle které se poznává nový child Bug.
type AdoRelation = { Rel: string; Url: string }

/// Work item přesně tak, jak přijde z REST API.
type AdoWorkItem =
    {
        Id: int
        Fields: AdoWorkItemFields
        Relations: AdoRelation list option
    }

/// Work item ve tvaru, ve kterém odchází klientovi.
///
/// Popis je už převedený na markdown **na serveru** — kdyby si ho klient
/// konvertoval sám, mohl by dojít k jinému výsledku než porovnání v
/// `detectChanges` a UI by hlásilo falešné rozdíly.
type AdoWorkItemView =
    {
        Id: int
        Title: string
        State: string
        WorkItemType: string
        AssignedTo: string | null
        AssignedToEmail: string | null
        AreaPath: string
        IterationPath: string
        RemainingWork: float option
        DescriptionMd: string
    }

// ── Snapshot (baseline pro diff) ────────────────────────────────────────────

/// Stav jednoho work itemu při posledním syncu.
type AdoSnapshotItem =
    {
        State: string
        RemainingWork: float option
        AssignedTo: string | null
        DescriptionHash: string
        WorkItemType: string
        Title: string
    }

/// Baseline posledního syncu. Kromě položek nese i **uživatelská rozhodnutí**
/// (co bylo potvrzeno a co ignorováno) — bez nich by se uživateli při každém
/// syncu vynořilo znovu všechno, co už jednou odklikl. Ukládá se do
/// `ado_credentials.snapshot_json` (ADR-008).
///
/// `Items` je klíčovaný řetězcem (id work itemu), aby JSON byl objekt a ne
/// pole dvojic.
type AdoSnapshot =
    {
        LastSync: string
        Items: Map<string, AdoSnapshotItem>
        IgnoredGapIds: int list
        /// Klíč je `"{wiId}-{typ změny}"`.
        AcknowledgedChanges: string list
        IgnoredUnlinkedTaskIds: string list
    }

    static member Empty =
        {
            LastSync = ""
            Items = Map.empty
            IgnoredGapIds = []
            AcknowledgedChanges = []
            IgnoredUnlinkedTaskIds = []
        }

// ── Detekované změny ────────────────────────────────────────────────────────

/// Typ detekované změny (FR-ADO-05 a FR-ADO-07). Hodnoty na wire jsou stejné
/// jako `WIChangeType` v `src/types/index.ts`.
[<JsonFSharpConverter(JsonUnionEncoding.UnwrapFieldlessTags)>]
type WiChangeType =
    | [<JsonName "state_regression">] StateRegression
    | [<JsonName "new_bug_child">] NewBugChild
    | [<JsonName "remaining_increase">] RemainingIncrease
    | [<JsonName "remaining_decrease">] RemainingDecrease
    | [<JsonName "state_resolved">] StateResolved
    | [<JsonName "assignee_change">] AssigneeChange
    | [<JsonName "description_change">] DescriptionChange
    | [<JsonName "planner_assignment_differs">] PlannerAssignmentDiffers
    | [<JsonName "planner_completed_not_ado">] PlannerCompletedNotAdo

/// Závažnost změny — určuje pořadí ve výpisu a barvu odznaku.
[<JsonFSharpConverter(JsonUnionEncoding.UnwrapFieldlessTags)>]
type WiChangeSeverity =
    | [<JsonName "high">] SeverityHigh
    | [<JsonName "medium">] SeverityMedium
    | [<JsonName "sync">] SeveritySync
    | [<JsonName "info">] SeverityInfo

/// Směr změny. Chybí u čistě informativních změn z ADO.
[<JsonFSharpConverter(JsonUnionEncoding.UnwrapFieldlessTags)>]
type WiChangeDirection =
    | [<JsonName "ado_to_planner">] AdoToPlanner
    | [<JsonName "planner_to_ado">] PlannerToAdo

/// Jedna detekovaná změna mezi ADO a plánovačem.
type WiChange =
    {
        Type: WiChangeType
        Severity: WiChangeSeverity
        Direction: WiChangeDirection option
        WiId: int
        WiTitle: string
        TaskId: string
        TaskName: string
        Details: string
        OldValue: string | null
        NewValue: string | null
    }

/// Název typu změny na wire. Drží se stejných řetězců jako `JsonName` výše —
/// používá se ve složeném klíči rozhodnutí, který si klient i server musí
/// spočítat shodně.
let wiChangeTypeName (changeType: WiChangeType) =
    match changeType with
    | StateRegression -> "state_regression"
    | NewBugChild -> "new_bug_child"
    | RemainingIncrease -> "remaining_increase"
    | RemainingDecrease -> "remaining_decrease"
    | StateResolved -> "state_resolved"
    | AssigneeChange -> "assignee_change"
    | DescriptionChange -> "description_change"
    | PlannerAssignmentDiffers -> "planner_assignment_differs"
    | PlannerCompletedNotAdo -> "planner_completed_not_ado"

/// Klíč rozhodnutí uživatele nad změnou (`"1234-state_regression"`).
/// Klíč potvrzené změny.
///
/// Součástí je **i pozorovaná hodnota**. Bez ní byl klíč jen `(WI, typ)`,
/// takže jedno odkliknutí umlčelo daný typ změny pro daný work item navždy:
/// druhá, klidně vážnější regrese stavu se už nikdy neukázala. S hodnotou
/// platí potvrzení jen pro to, co uživatel skutečně viděl.
let changeKey (wiId: int) (changeType: WiChangeType) (value: string | null) =
    let suffix =
        match value with
        | null -> ""
        | actual -> "-" + actual

    $"{wiId}-{wiChangeTypeName changeType}{suffix}"

/// Hodnota, na kterou se potvrzení váže, odvozená ze snapshotu.
///
/// Musí dát stejný výsledek jako `WiChange.NewValue` z detekce — jinak by
/// potvrzení klíčem netrefilo změnu, kterou má umlčet.
let acknowledgedValue (item: AdoSnapshotItem option) (changeType: WiChangeType) : string | null =
    match item with
    | None -> null
    | Some snapshot ->
        match changeType with
        | StateRegression
        | StateResolved
        | PlannerCompletedNotAdo -> snapshot.State
        | AssigneeChange -> snapshot.AssignedTo
        | DescriptionChange -> snapshot.DescriptionHash
        | RemainingIncrease
        | RemainingDecrease -> snapshot.RemainingWork |> Option.map string |> Option.toObj
        | NewBugChild
        | PlannerAssignmentDiffers -> null

/// Závažnost odvozená od typu změny (FR-ADO-05).
let severityOf (changeType: WiChangeType) =
    match changeType with
    | StateRegression
    | NewBugChild -> SeverityHigh
    | RemainingIncrease
    | AssigneeChange -> SeverityMedium
    | StateResolved
    | RemainingDecrease -> SeverityInfo
    | DescriptionChange
    | PlannerAssignmentDiffers
    | PlannerCompletedNotAdo -> SeveritySync

/// Pořadí pro řazení výpisu změn — nejzávažnější nahoře.
let severityRank (severity: WiChangeSeverity) =
    match severity with
    | SeverityHigh -> 0
    | SeverityMedium -> 1
    | SeveritySync -> 2
    | SeverityInfo -> 3

/// Typ akce zaznamenané v sync logu. Hodnoty na wire jsou VELKÝMI písmeny
/// (kontrakt s frontendem, `ADOSyncAction` v `src/types/index.ts`).
[<JsonFSharpConverter(JsonUnionEncoding.UnwrapFieldlessTags)>]
type AdoSyncAction =
    | [<JsonName "ACKNOWLEDGED">] Acknowledged
    | [<JsonName "ADDED_TO_PLAN">] AddedToPlan
    | [<JsonName "PUSHED_TO_ADO">] PushedToAdo
    | [<JsonName "DESC_SYNC_TO_ADO">] DescSyncToAdo
    | [<JsonName "DESC_SYNC_FROM_ADO">] DescSyncFromAdo
    | [<JsonName "DESC_SYNC_BOTH">] DescSyncBoth
    | [<JsonName "IGNORED">] Ignored
    | [<JsonName "LINKED">] Linked
    | [<JsonName "MD_ADDED">] MdAdded

/// Záznam v ADO sync logu. Log je součástí stavu projektu (ADR-008).
type AdoSyncLogEntry =
    {
        Id: string
        Timestamp: string
        Action: AdoSyncAction
        TaskId: string option
        TaskName: string option
        WiId: int option
        WiTitle: string option
        Details: string
    }

// ── Payloady commandů a výsledků ────────────────────────────────────────────

/// Data pro založení nového work itemu z úkolu (FR-ADO-08). Popis přichází
/// jako markdown, na HTML ho převede server.
type AdoWorkItemDraft =
    {
        WiType: string
        Title: string
        DescriptionMd: string
        AreaPath: string
        IterationPath: string
        AssignedTo: string
        RemainingWork: float
    }

/// Uživatelská rozhodnutí ze snapshotu, jak je vidí klient.
type AdoDecisions =
    {
        IgnoredGapIds: int list
        AcknowledgedChanges: string list
        IgnoredUnlinkedTaskIds: string list
    }

/// Doprovodná data výsledku syncu — work items pro zobrazení detailu a diffu
/// popisu, čas syncu a uživatelská rozhodnutí ze snapshotu.
type AdoSyncContext =
    {
        WorkItems: AdoWorkItemView list
        LastSync: string
        Decisions: AdoDecisions
    }

/// Co se přebírá z ADO do plánovače (FR-ADO-06).
[<JsonFSharpConverter(JsonUnionEncoding.UnwrapFieldlessTags)>]
type AdoAcceptField =
    | [<JsonName "state">] AcceptState
    | [<JsonName "assignee">] AcceptAssignee
    | [<JsonName "description">] AcceptDescription
