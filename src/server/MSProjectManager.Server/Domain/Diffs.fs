/// Diffy server → klient (ADR-004, `src/types/protocol.ts`).
///
/// Broadcastuje se diff, ne celý stav; jediná výjimka je `full_state` při
/// prvním připojení a po reconnectu (FR-COLLAB-01). Na wire je diskriminátor
/// v poli `op`, název vzniká snake_case politikou z názvu case
/// (`TaskAdded` → `task_added`).
///
/// Oproti seznamu v ADR-004 přibyly diffy pro entity, které ADR-004 zná jako
/// commandy, ale k diffu se u nich nedostal (TODO, připomínky), a pro
/// funkcionalitu doplněnou v PRD (soubory ADR-010, ADO PRD-06, změna role
/// FR-ROLE-06). Frontendový `ProjectDiff` je potřeba dorovnat.
module MSProjectManager.Domain.Diffs

open System.Text.Json.Serialization
open Microsoft.FSharp
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches

/// Změna stavu projektu určená k rozeslání do skupiny `project:{projectId}`.
type ProjectDiff =
    // Úkoly
    | TaskAdded of task: Task
    | TaskUpdated of taskId: string * fields: TaskFields
    | TaskDeleted of taskId: string
    // Osoby a kapacita
    | PersonAdded of person: Person
    | PersonUpdated of personId: string * fields: PersonFields
    | PersonDeleted of personId: string
    | AllocUpdated of personId: string * weekIdx: int * pct: float
    // Metadata projektu
    | ProjectUpdated of fields: ProjectFields
    | MilestonesSet of milestones: Milestone list
    | MilestoneChecklistUpdated of milestoneId: string * checkItems: MilestoneCheckItem list
    | CatsSet of cats: Categories
    | RolesSet of roles: Roles
    // Rizika a příležitosti
    | RiskAdded of risk: Risk
    | RiskUpdated of riskId: string * fields: RiskFields
    | RiskDeleted of riskId: string
    | OpportunityAdded of opp: Opportunity
    | OpportunityUpdated of oppId: string * fields: OpportunityFields
    | OpportunityDeleted of oppId: string
    // Znalostní báze
    | KbPageAdded of page: KbPage
    | KbPageUpdated of pageId: string * fields: KbPageFields
    | KbPageDeleted of pageId: string
    // Osobní nástroje
    | TodoAdded of todo: TodoItem
    | TodoUpdated of todoId: string * fields: TodoFields
    | TodoDeleted of todoId: string
    | ReminderAdded of reminder: RecurringReminder
    | ReminderUpdated of reminderId: string * fields: ReminderFields
    | ReminderDeleted of reminderId: string
    // Přílohy
    | FileAdded of file: FileRef
    | FileNoteUpdated of fileId: string * note: string
    | FileDeleted of fileId: string
    // Azure DevOps
    /// `patSet`/`patUpdatedAt` jsou per-user stav PATu, ne součást `AppState`
    /// (ADR-004). Diff proto skládá `AdoBridge`, ne reducer — a doručuje se
    /// jen odesílateli, protože stav PATu jiného uživatele mu nepřísluší.
    | AdoConfigUpdated of config: AdoConfig * patSet: bool * patUpdatedAt: string option
    /// Uložení i smazání PATu (FR-ADO-02); `patSet=false` znamená „PAT není nastaven".
    | AdoPatSaved of patSet: bool * patUpdatedAt: string option
    /// Výsledek „Ověřit připojení" (FR-ADO-03) — zobrazuje se inline.
    | AdoConnectionTested of ok: bool * message: string
    /// Průběh syncu (FR-ADO-04, „Stahuji work items… (42/87)").
    | AdoSyncProgress of phase: string * completed: int * total: int
    /// Výsledek syncu. `context` nese work items pro zobrazení detailu, čas
    /// syncu a uživatelská rozhodnutí ze snapshotu.
    | AdoSyncCompleted of
        changes: WiChange list *
        gaps: AdoWorkItemView list *
        log: AdoSyncLogEntry list *
        context: AdoSyncContext
    | AdoSyncLogAppended of entry: AdoSyncLogEntry
    // Session
    /// Posílá se jen odesílateli nebo per spojení — nese projekci
    /// `State.forUser`, tedy vlastní TODO a připomínky příjemce.
    | FullState of state: ClientAppState
    | Presence of users: PresenceEntry list
    | RoleChanged of newRole: ProjectRole
    /// Odmítnutý command. Klient rollbackne optimistickou změnu a zobrazí toast.
    | [<JsonName "error">] ErrorOccurred of message: string * commandType: string

/// Komu diff patří (ADR-004, „Routing diffů — ne všechno je broadcast").
type DiffDelivery =
    /// Celé skupině `project:{projectId}`.
    | Broadcast
    /// Jen spojení, které command poslalo — per-user data a chyby.
    | SenderOnly
    /// Každému spojení zvlášť, protože nese projekci stavu pro daného uživatele.
    | PerConnection

/// Diffy, které se **nesmí** broadcastovat: nesou data jednoho uživatele.
/// `nameof` je proti překlepům — přejmenování case se propíše i sem.
let private senderOnlyCases =
    set
        [
            nameof TodoAdded
            nameof TodoUpdated
            nameof TodoDeleted
            nameof ReminderAdded
            nameof ReminderUpdated
            nameof ReminderDeleted
            nameof RoleChanged
            nameof AdoConfigUpdated
            nameof AdoPatSaved
            nameof AdoConnectionTested
            nameof AdoSyncProgress
            nameof ErrorOccurred
        ]

/// Doručení předpočítané podle pořadí case v DU — `deliveryOf` je pak jen
/// indexace, ne čtyřicetivětvý `match` (limit složitosti z ADR-012).
let private deliveryByTag =
    Reflection.FSharpType.GetUnionCases typeof<ProjectDiff>
    |> Array.map (fun case ->
        if senderOnlyCases.Contains case.Name then SenderOnly
        elif case.Name = nameof FullState then PerConnection
        else Broadcast
    )

/// Rozhodne, komu se diff pošle. Výchozí je broadcast; per-user diffy jsou
/// vyjmenované výše a hlídá je test, který kontroluje počet case v DU.
let deliveryOf (diff: ProjectDiff) =
    let case, _ = Reflection.FSharpValue.GetUnionFields(diff, typeof<ProjectDiff>)
    deliveryByTag.[case.Tag]
